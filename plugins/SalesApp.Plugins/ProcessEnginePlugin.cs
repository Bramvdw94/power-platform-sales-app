using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using SalesApp.Plugins.Engine;

namespace SalesApp.Plugins
{
    /// <summary>
    /// The generic process engine (ADR 0001, issue 94). Registered synchronously on create and update of
    /// Lead, Opportunity, Account and Contact. Pre-operation (stage 20) it loads the definitions, runs
    /// the same engine the shared cases pin down, rejects the save or writes what the engine sets onto the
    /// Target; post-operation (stage 40) it creates the Action Tasks in the same transaction. The save
    /// itself runs with the caller's own rights; definitions are read, and Tasks and Engine errors written,
    /// as the system. Anything unexpected fails open: the save goes through and an Engine error is written.
    /// </summary>
    public class ProcessEnginePlugin : PluginBase
    {
        public const string KillSwitch = "vibe_ProcessEngineEnabled";
        public const string ProcessBuilderRole = "SalesApp Process Builder";
        const string TasksVariable = "SalesApp.EngineTasks";
        const int ChoiceBase = FieldMap.ChoiceBase;
        static readonly string[] ProcessTables = { "lead", "opportunity" };
        static readonly string[] TableChoice = { "lead", "opportunity", "account", "contact" };

        public ProcessEnginePlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ProcessEnginePlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null) throw new ArgumentNullException(nameof(localPluginContext));
            var context = localPluginContext.PluginExecutionContext;
            if (context.Depth > 4) return;
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            if (target == null) return;
            var table = FieldMap.LogicalNames.Where(p => TableChoice.Contains(p.Key)).Where(p => p.Value == target.LogicalName).Select(p => p.Key).FirstOrDefault();
            if (table == null) return;

            var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
            if (context.Stage == 40)
            {
                CreateTasks(localPluginContext, system, target, table);
                return;
            }

            if (!EngineEnabled(system)) return;
            try
            {
                RunPreOperation(localPluginContext, system, target, table);
            }
            catch (InvalidPluginExecutionException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Fail open: a bug or a Dataverse hiccup in the engine never stops a salesperson's save.
                localPluginContext.Trace("Process engine failed open: " + ex);
                WriteErrors(system, table, target.Id, new List<EngineErrorReport>
                {
                    new EngineErrorReport { Code = "engineException", Message = Truncate(ex.GetType().Name + ": " + ex.Message, 2000) },
                });
            }
        }

        static string Truncate(string text, int length) => text == null || text.Length <= length ? text : text.Substring(0, length);

        static string Id(Guid id) => id.ToString("D");

        // ---- kill switch -------------------------------------------------------------------

        /// <summary>The environment variable vibe_ProcessEngineEnabled; missing or unreadable means on.</summary>
        static bool EngineEnabled(IOrganizationService system)
        {
            var definitionQuery = new QueryExpression("environmentvariabledefinition")
            {
                ColumnSet = new ColumnSet("defaultvalue"), TopCount = 1,
            };
            definitionQuery.Criteria.AddCondition("schemaname", ConditionOperator.Equal, KillSwitch);
            var definition = system.RetrieveMultiple(definitionQuery).Entities.FirstOrDefault();
            if (definition == null) return true;
            var value = definition.GetAttributeValue<string>("defaultvalue");
            var valueQuery = new QueryExpression("environmentvariablevalue") { ColumnSet = new ColumnSet("value"), TopCount = 1 };
            valueQuery.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, definition.Id);
            var current = system.RetrieveMultiple(valueQuery).Entities.FirstOrDefault();
            if (current != null && !string.IsNullOrWhiteSpace(current.GetAttributeValue<string>("value"))) value = current.GetAttributeValue<string>("value");
            if (string.IsNullOrWhiteSpace(value)) return true;
            switch (value.Trim().ToLowerInvariant())
            {
                case "no": case "false": case "off": case "0": return false;
                default: return true;
            }
        }

        // ---- pre-operation -----------------------------------------------------------------

        void RunPreOperation(ILocalPluginContext local, IOrganizationService system, Entity target, string table)
        {
            var context = local.PluginExecutionContext;
            var isCreate = context.MessageName == "Create";
            var logical = target.LogicalName;
            var now = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
            var errors = new List<EngineErrorReport>();

            EngineRecord before = null;
            if (!isCreate)
            {
                var stored = system.Retrieve(logical, target.Id, new ColumnSet(FieldMap.Columns(table)));
                before = FieldMap.ToRecord(table, stored);
            }
            var change = FieldMap.ToChange(table, target);
            var callerId = Id(context.UserId);
            var ownerWritten = change.ContainsKey("ownerId");
            if (isCreate && !ownerWritten) change["ownerId"] = callerId;

            var input = new SaveInput
            {
                Table = table,
                Before = before,
                Change = change,
                Caller = new Caller { Id = callerId },
                Now = now,
                Fields = FieldMap.Catalogue(),
                Rules = LoadRules(system, table, errors),
                Users = new Dictionary<string, UserInfo>(),
            };

            var touchesVersion = change.ContainsKey("processVersionId");
            if (touchesVersion) input.Caller.IsProcessBuilder = HasRole(system, context.UserId, ProcessBuilderRole);

            var versionIds = new HashSet<Guid>();
            if (ProcessTables.Contains(table))
            {
                if (isCreate)
                {
                    input.Processes = LoadProcesses(system, table);
                    foreach (var p in input.Processes)
                    {
                        Guid latest;
                        if (Guid.TryParse(p.LatestVersionId, out latest)) versionIds.Add(latest);
                    }
                }
                else
                {
                    AddGuid(versionIds, before.Get("processVersionId") as string);
                    AddGuid(versionIds, change.Get("processVersionId") as string);
                }
            }
            input.Versions = LoadVersions(system, versionIds, errors);

            var state = new EngineRecord(before ?? new EngineRecord());
            foreach (var pair in change) state[pair.Key] = pair.Value;

            var checks = new List<Check>();
            foreach (var rule in input.Rules.Where(r => r.Enabled && r.Definition.Table == table)) checks.AddRange(rule.Definition.When.Conditions);
            var wantsTasks = false;
            foreach (var version in input.Versions)
            {
                if (version.Definition.EntryCriteria != null) checks.AddRange(version.Definition.EntryCriteria.Conditions);
                foreach (var step in version.Definition.Steps)
                {
                    checks.AddRange(step.GateChecks);
                    if (step.Actions.OfType<CreateTaskAction>().Any()) wantsTasks = true;
                }
            }

            input.Parents = LoadParents(system, table, state, checks);
            input.Related = LoadRelated(system, logical, target.Id, table, checks, wantsTasks, isCreate);

            LoadUser(system, input.Users, state.Get("ownerId") as string);
            if (before != null) LoadUser(system, input.Users, before.Get("ownerId") as string);
            foreach (var manager in input.Users.Values.Select(u => u.ManagerId).Where(m => m != null).Distinct().ToList())
            {
                LoadUser(system, input.Users, manager);
            }

            var outcome = SaveLogic.Evaluate(input);
            errors.AddRange(outcome.EngineErrors);
            WriteErrors(system, table, target.Id, errors);

            if (!outcome.Allowed)
            {
                local.Trace("Process engine rejected " + context.MessageName + " of " + logical + ": " + outcome.Rejection.Code + " " + outcome.Rejection.Message);
                throw new InvalidPluginExecutionException(outcome.Rejection.Message);
            }

            ApplyChanges(table, target, change, outcome, isCreate, ownerWritten);
            if (outcome.Tasks.Count > 0)
            {
                context.SharedVariables[TasksVariable] = JsonConvert.SerializeObject(outcome.Tasks);
            }
        }

        static void AddGuid(HashSet<Guid> set, string text)
        {
            Guid id;
            if (!string.IsNullOrEmpty(text) && Guid.TryParse(text, out id)) set.Add(id);
        }

        static void ApplyChanges(string table, Entity target, EngineRecord written, SaveOutcome outcome, bool isCreate, bool ownerWritten)
        {
            var defs = FieldMap.Tables[table].ToDictionary(d => d.Name);
            foreach (var pair in outcome.Changes)
            {
                FieldDef def;
                if (!defs.TryGetValue(pair.Key, out def) || pair.Key == "createdOn") continue;
                if (pair.Key == "ownerId" && !ownerWritten) continue;
                if (written.ContainsKey(pair.Key) && Conditions.Same(written[pair.Key], pair.Value)) continue;
                object attribute;
                if (FieldMap.TryToAttribute(def, pair.Value, out attribute)) target[def.Column] = attribute;
            }
            if (isCreate)
            {
                // A create can't choose its own Process version, Step or Step date.
                foreach (var name in Conditions.EngineColumns)
                {
                    if (outcome.Changes.ContainsKey(name)) continue;
                    FieldDef def;
                    if (defs.TryGetValue(name, out def)) target.Attributes.Remove(def.Column);
                }
            }
        }

        // ---- definitions -------------------------------------------------------------------

        static List<ProcessRow> LoadProcesses(IOrganizationService system, string table)
        {
            var query = new QueryExpression("vibe_process")
            {
                ColumnSet = new ColumnSet("vibe_name", "vibe_priority", "vibe_isfallback", "vibe_retired", "vibe_latestversionid"),
            };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("vibe_tablechoice", ConditionOperator.Equal, ChoiceBase + Array.IndexOf(TableChoice, table));
            return system.RetrieveMultiple(query).Entities.Select(e => new ProcessRow
            {
                Id = Id(e.Id),
                Name = e.GetAttributeValue<string>("vibe_name"),
                Table = table,
                Priority = e.GetAttributeValue<int?>("vibe_priority") ?? 0,
                IsFallback = e.GetAttributeValue<bool?>("vibe_isfallback") ?? false,
                Retired = e.GetAttributeValue<bool?>("vibe_retired") ?? false,
                LatestVersionId = e.GetAttributeValue<EntityReference>("vibe_latestversionid") == null
                    ? null : Id(e.GetAttributeValue<EntityReference>("vibe_latestversionid").Id),
            }).ToList();
        }

        static List<ProcessVersionRow> LoadVersions(IOrganizationService system, HashSet<Guid> ids, List<EngineErrorReport> errors)
        {
            var versions = new List<ProcessVersionRow>();
            if (ids.Count == 0) return versions;
            var query = new QueryExpression("vibe_processversion") { ColumnSet = new ColumnSet("vibe_processid", "vibe_definition") };
            query.Criteria.AddCondition("vibe_processversionid", ConditionOperator.In, ids.Cast<object>().ToArray());
            foreach (var e in system.RetrieveMultiple(query).Entities)
            {
                var process = e.GetAttributeValue<EntityReference>("vibe_processid");
                try
                {
                    versions.Add(new ProcessVersionRow
                    {
                        Id = Id(e.Id),
                        ProcessId = process == null ? null : Id(process.Id),
                        Definition = EngineJson.ParseProcess(e.GetAttributeValue<string>("vibe_definition") ?? "{}"),
                    });
                }
                catch (Exception ex)
                {
                    errors.Add(new EngineErrorReport
                    {
                        ProcessId = process == null ? null : Id(process.Id),
                        Code = "definitionInvalid",
                        Message = Truncate("A Process version couldn't be read: " + ex.Message, 2000),
                    });
                }
            }
            return versions;
        }

        static List<BusinessRuleRow> LoadRules(IOrganizationService system, string table, List<EngineErrorReport> errors)
        {
            var rules = new List<BusinessRuleRow>();
            var query = new QueryExpression("vibe_businessrule") { ColumnSet = new ColumnSet("vibe_name", "vibe_enabled", "vibe_definition") };
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("vibe_enabled", ConditionOperator.Equal, true);
            query.Criteria.AddCondition("vibe_tablechoice", ConditionOperator.Equal, ChoiceBase + Array.IndexOf(TableChoice, table));
            query.AddOrder("createdon", OrderType.Ascending);
            foreach (var e in system.RetrieveMultiple(query).Entities)
            {
                try
                {
                    rules.Add(new BusinessRuleRow
                    {
                        Id = Id(e.Id),
                        Name = e.GetAttributeValue<string>("vibe_name"),
                        Enabled = true,
                        Definition = EngineJson.ParseRule(e.GetAttributeValue<string>("vibe_definition") ?? "{}"),
                    });
                }
                catch (Exception ex)
                {
                    errors.Add(new EngineErrorReport { RuleId = Id(e.Id), Code = "definitionInvalid", Message = Truncate("The rule couldn't be read: " + ex.Message, 2000) });
                }
            }
            return rules;
        }

        // ---- context the engine reads ------------------------------------------------------

        static bool HasRole(IOrganizationService system, Guid userId, string roleName)
        {
            var query = new QueryExpression("systemuserroles") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            query.AddLink("role", "roleid", "roleid").LinkCriteria.AddCondition("name", ConditionOperator.Equal, roleName);
            return system.RetrieveMultiple(query).Entities.Count > 0;
        }

        static void LoadUser(IOrganizationService system, Dictionary<string, UserInfo> users, string id)
        {
            Guid guid;
            if (string.IsNullOrEmpty(id) || users.ContainsKey(id) || !Guid.TryParse(id, out guid)) return;
            try
            {
                var user = system.Retrieve("systemuser", guid, new ColumnSet("parentsystemuserid", "isdisabled"));
                var manager = user.GetAttributeValue<EntityReference>("parentsystemuserid");
                users[id] = new UserInfo
                {
                    ManagerId = manager == null ? null : Id(manager.Id),
                    Disabled = user.GetAttributeValue<bool?>("isdisabled") ?? false,
                };
            }
            catch (Exception)
            {
                // An owner that is a team or unreadable simply has no manager.
                users[id] = new UserInfo();
            }
        }

        static Dictionary<string, EngineRecord> LoadParents(IOrganizationService system, string table, EngineRecord state, List<Check> checks)
        {
            var parents = new Dictionary<string, EngineRecord>();
            var names = new HashSet<string>(checks.OfType<FieldCondition>().Where(c => c.Field.Contains(".")).Select(c => c.Field.Substring(0, c.Field.IndexOf('.'))));
            foreach (var name in names)
            {
                Conditions.ParentLink link;
                if (!Conditions.Parents[table].TryGetValue(name, out link)) continue;
                Guid id;
                if (!Guid.TryParse(state.Get(link.Lookup) as string, out id)) continue;
                try
                {
                    var entity = system.Retrieve(FieldMap.LogicalNames[link.Table], id, new ColumnSet(FieldMap.Columns(link.Table)));
                    parents[name] = FieldMap.ToRecord(link.Table, entity);
                }
                catch (Exception)
                {
                    // A parent that can't be read reads as empty.
                }
            }
            return parents;
        }

        static Dictionary<string, List<EngineRecord>> LoadRelated(IOrganizationService system, string logical, Guid id, string table, List<Check> checks, bool wantsTasks, bool isCreate)
        {
            var related = new Dictionary<string, List<EngineRecord>>();
            if (isCreate) return related;
            var lists = new HashSet<string>(checks.OfType<RelatedCheck>().Select(c => c.Related));
            if (wantsTasks) lists.Add("tasks");
            foreach (var list in lists)
            {
                string itemTable;
                if (!Conditions.RelatedLists[table].TryGetValue(list, out itemTable)) continue;
                var items = new List<EngineRecord>();
                switch (list)
                {
                    case "tasks": case "phoneCalls": case "notes":
                    {
                        var logicalName = FieldMap.LogicalNames[itemTable];
                        var query = new QueryExpression(logicalName) { ColumnSet = new ColumnSet(FieldMap.Columns(itemTable)), TopCount = 500 };
                        query.Criteria.AddCondition(itemTable == "note" ? "objectid" : "regardingobjectid", ConditionOperator.Equal, id);
                        items = system.RetrieveMultiple(query).Entities.Select(e => FieldMap.ToRecord(itemTable, e)).ToList();
                        break;
                    }
                    case "quotes":
                    {
                        var query = new QueryExpression("vibe_quote") { ColumnSet = new ColumnSet(FieldMap.Columns("quote")), TopCount = 500 };
                        query.Criteria.AddCondition("vibe_opportunityid", ConditionOperator.Equal, id);
                        items = system.RetrieveMultiple(query).Entities.Select(e => FieldMap.ToRecord("quote", e)).ToList();
                        break;
                    }
                    case "contacts":
                    {
                        var query = new QueryExpression("contact") { ColumnSet = new ColumnSet(FieldMap.Columns("contact")), TopCount = 500 };
                        query.Criteria.AddCondition("parentcustomerid", ConditionOperator.Equal, id);
                        items = system.RetrieveMultiple(query).Entities.Select(e => FieldMap.ToRecord("contact", e)).ToList();
                        break;
                    }
                    case "opportunities":
                    {
                        var query = new QueryExpression("vibe_opportunity") { ColumnSet = new ColumnSet(FieldMap.Columns("opportunity")), TopCount = 500 };
                        query.Criteria.AddCondition("vibe_accountid", ConditionOperator.Equal, id);
                        items = system.RetrieveMultiple(query).Entities.Select(e => FieldMap.ToRecord("opportunity", e)).ToList();
                        break;
                    }
                }
                related[list] = items;
            }
            return related;
        }

        // ---- Engine errors -----------------------------------------------------------------

        static void WriteErrors(IOrganizationService system, string table, Guid recordId, List<EngineErrorReport> errors)
        {
            foreach (var error in errors)
            {
                try
                {
                    if (ErrorExists(system, error, recordId)) continue;
                    var row = new Entity("vibe_engineerror");
                    row["vibe_name"] = Truncate(error.Code, 200);
                    row["vibe_code"] = Truncate(error.Code, 100);
                    row["vibe_message"] = Truncate(error.Message, 2000);
                    row["vibe_recordtable"] = table;
                    row["vibe_recordid"] = recordId == Guid.Empty ? null : Id(recordId);
                    row["vibe_actionid"] = error.ActionId;
                    row["vibe_occurredon"] = DateTime.UtcNow;
                    Guid ruleId, processId;
                    if (Guid.TryParse(error.RuleId, out ruleId)) row["vibe_ruleid"] = new EntityReference("vibe_businessrule", ruleId);
                    if (Guid.TryParse(error.ProcessId, out processId)) row["vibe_processid"] = new EntityReference("vibe_process", processId);
                    system.Create(row);
                }
                catch (Exception)
                {
                    // Logging an error must never be what stops the save.
                }
            }
        }

        static bool ErrorExists(IOrganizationService system, EngineErrorReport error, Guid recordId)
        {
            var query = new QueryExpression("vibe_engineerror") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("vibe_code", ConditionOperator.Equal, Truncate(error.Code, 100));
            query.Criteria.AddCondition("vibe_message", ConditionOperator.Equal, Truncate(error.Message, 2000));
            Guid ruleId, processId;
            if (Guid.TryParse(error.RuleId, out ruleId)) query.Criteria.AddCondition("vibe_ruleid", ConditionOperator.Equal, ruleId);
            else query.Criteria.AddCondition("vibe_ruleid", ConditionOperator.Null);
            if (Guid.TryParse(error.ProcessId, out processId)) query.Criteria.AddCondition("vibe_processid", ConditionOperator.Equal, processId);
            else query.Criteria.AddCondition("vibe_processid", ConditionOperator.Null);
            if (recordId != Guid.Empty) query.Criteria.AddCondition("vibe_recordid", ConditionOperator.Equal, Id(recordId));
            return system.RetrieveMultiple(query).Entities.Count > 0;
        }

        // ---- post-operation: Action Tasks ---------------------------------------------------

        static void CreateTasks(ILocalPluginContext local, IOrganizationService system, Entity target, string table)
        {
            var context = local.PluginExecutionContext;
            if (!context.SharedVariables.Contains(TasksVariable)) return;
            var tasks = JsonConvert.DeserializeObject<List<TaskToCreate>>((string)context.SharedVariables[TasksVariable]);
            var recordId = target.Id;
            if (recordId == Guid.Empty && context.OutputParameters.Contains("id")) recordId = (Guid)context.OutputParameters["id"];
            foreach (var task in tasks)
            {
                try
                {
                    CreateTask(local, system, target.LogicalName, recordId, task);
                }
                catch (InvalidPluginExecutionException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    // An Action that can't run fails open: the save stands and an Engine error says why.
                    local.Trace("Process engine couldn't create Task for action " + task.ActionId + ": " + ex);
                    WriteErrors(system, table, recordId, new List<EngineErrorReport>
                    {
                        new EngineErrorReport { ActionId = task.ActionId, Code = "taskFailed", Message = Truncate("The Task \u201c" + task.Subject + "\u201d couldn't be created: " + ex.Message, 2000) },
                    });
                }
            }
        }

        static void CreateTask(ILocalPluginContext local, IOrganizationService system, string logicalName, Guid recordId, TaskToCreate task)
        {
            {
                var row = new Entity("task");
                row["subject"] = task.Subject;
                if (!string.IsNullOrEmpty(task.Description)) row["description"] = task.Description;
                row["scheduledend"] = DateTime.ParseExact(task.DueDate, "yyyy-MM-dd", CultureInfo.InvariantCulture);
                row["ownerid"] = new EntityReference("systemuser", Guid.Parse(task.OwnerId));
                row["regardingobjectid"] = new EntityReference(logicalName, recordId);
                row["vibe_actionid"] = task.ActionId;
                system.Create(row);
                local.Trace("Process engine created Task for action " + task.ActionId);
            }
        }
    }
}
