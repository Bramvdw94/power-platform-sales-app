using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace SalesApp.Plugins.Engine
{
    /// <summary>
    /// Decides a save of a Lead, Opportunity, Account or Contact. A port of
    /// src/sales/engine/save.ts: what the plug-in does before the write (pick a
    /// Process, check Gates, set Stage or Lead status from the Step, apply rules)
    /// and which Action Tasks it creates after it. Both are held to the shared
    /// cases in process-engine/cases.
    /// </summary>
    public static class SaveLogic
    {
        public const int MaxSetValueRounds = 5;

        public static readonly string[] ExemptKinds = { "reassign", "closeLost", "disqualify", "switchProcess" };

        class Rejected : Exception
        {
            public Rejection Rejection { get; }
            public Rejected(Rejection rejection) : base(rejection.Message) { Rejection = rejection; }
        }

        static Rejected Reject(string code, string message, string stepId = null, List<int> failedChecks = null, List<string> ruleIds = null)
        {
            return new Rejected(new Rejection { Code = code, Message = message, StepId = stepId, FailedChecks = failedChecks, RuleIds = ruleIds });
        }

        static string StatusField(string table)
        {
            return table == "opportunity" ? "stage" : table == "lead" ? "status" : null;
        }

        static bool Same(object a, object b) => Conditions.Same(a, b);

        static bool IsOpenStatus(object status)
        {
            var text = status as string;
            return text != null && ProcessLogic.StepStatusOrder.ContainsKey(text);
        }

        static string Str(object value) => value == null ? "undefined" : Convert.ToString(value, CultureInfo.InvariantCulture);

        static string AddDays(string now, int days)
        {
            var date = DateTime.ParseExact(now.Substring(0, 10), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
            return date.AddDays(days).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        public static string Classify(string table, EngineRecord before, EngineRecord change)
        {
            if (before == null) return "create";
            var changed = change.Keys.Where(f => !Same(before.Get(f), change[f])).ToList();
            if (changed.Contains("processVersionId")) return "switchProcess";
            if (table == "opportunity" && changed.Contains("stage") && Equals(change.Get("stage"), "closedLost")) return "closeLost";
            if (table == "lead" && changed.Contains("status") && Equals(change.Get("status"), "disqualified")) return "disqualify";
            if (changed.Count > 0 && changed.All(f => f == "ownerId" || f == "ownerName")) return "reassign";
            return "update";
        }

        public static SaveOutcome Evaluate(SaveInput input)
        {
            var kind = Classify(input.Table, input.Before, input.Change);
            var outcome = new SaveOutcome { Kind = kind, Changes = new EngineRecord(input.Change) };
            if (!input.EngineEnabled) return outcome;
            if (input.Before == null)
            {
                // The engine picks the Process of a new record; a create can't choose its own.
                var change = new EngineRecord(input.Change);
                foreach (var column in Conditions.EngineColumns) change.Remove(column);
                input.Change = change;
                outcome.Changes = new EngineRecord(change);
            }
            try
            {
                return Run(input, outcome);
            }
            catch (Rejected rejected)
            {
                outcome.Allowed = false;
                outcome.Rejection = rejected.Rejection;
                outcome.Tasks = new List<TaskToCreate>();
                return outcome;
            }
        }

        static SaveOutcome Run(SaveInput input, SaveOutcome outcome)
        {
            var table = input.Table;
            var before = input.Before;
            var change = input.Change;
            var exempt = ExemptKinds.Contains(outcome.Kind);
            var state = new EngineRecord(before ?? new EngineRecord());
            foreach (var pair in change) state[pair.Key] = pair.Value;
            Func<EngineRecord, ConditionScope> scopeOf = record => new ConditionScope
            {
                Table = table, EngineRecord = record, Parents = input.Parents, Related = input.Related,
            };
            Action<EngineErrorReport> addError = error =>
            {
                if (!outcome.EngineErrors.Any(e => e.RuleId == error.RuleId && e.ProcessId == error.ProcessId && e.ActionId == error.ActionId && e.Code == error.Code))
                {
                    outcome.EngineErrors.Add(error);
                }
            };

            var ruleErrors = new List<EngineErrorReport>();
            var rules = Rules.Runnable(table, input.Rules ?? new List<BusinessRuleRow>(), input.Fields, ruleErrors);
            ruleErrors.ForEach(addError);

            // Set value fires when its condition becomes true: it holds now but did not hold on the stored record.
            var heldBefore = rules.ToDictionary(r => r.Id, r => before != null && Conditions.ConditionsHold(scopeOf(before), r.Definition.When));
            var roundsUsed = 0;
            var everChanged = new HashSet<string>();
            Action runSetValues = () =>
            {
                if (exempt) return;
                for (;;)
                {
                    var snapshot = new EngineRecord(state);
                    var changedBy = new HashSet<string>();
                    foreach (var rule in rules)
                    {
                        if (heldBefore[rule.Id] || !Conditions.ConditionsHold(scopeOf(snapshot), rule.Definition.When)) continue;
                        foreach (var effect in rule.Definition.Effects)
                        {
                            if (effect.Type != "setValue") continue;
                            // Estimated value is kept from Product lines while they exist; rules don't fight it.
                            if (effect.Field == "estimatedValue" && ProductLineCount(input) > 0) continue;
                            if (!Same(state.Get(effect.Field), effect.Value))
                            {
                                state[effect.Field] = effect.Value;
                                changedBy.Add(rule.Id);
                            }
                        }
                    }
                    if (changedBy.Count == 0) return;
                    foreach (var id in changedBy) everChanged.Add(id);
                    roundsUsed += 1;
                    if (roundsUsed > MaxSetValueRounds)
                    {
                        var names = rules.Where(r => everChanged.Contains(r.Id)).Select(r => "“" + r.Name + "”");
                        throw Reject("setValueLoop",
                            "The rules " + string.Join(", ", names) + " keep changing each other's fields, so the record can't be saved.",
                            ruleIds: everChanged.ToList());
                    }
                }
            };

            runSetValues();
            var statusMoved = HandleProcess(input, outcome, state, scopeOf, addError);
            runSetValues();

            if (!exempt) CheckRules(input, rules, state, statusMoved, scopeOf);

            outcome.Warnings = Rules.EffectsOf(scopeOf(state), rules).Warnings
                .Select(w => new WarningOut { RuleId = w.RuleId, Message = w.Message, Field = w.Field }).ToList();
            outcome.Changes = Diff(before, change, state);
            return outcome;
        }

        static int ProductLineCount(SaveInput input)
        {
            List<EngineRecord> lines = null;
            if (input.Related != null) input.Related.TryGetValue("productLines", out lines);
            return lines == null ? 0 : lines.Count;
        }

        static EngineRecord Diff(EngineRecord stored, EngineRecord written, EngineRecord final)
        {
            var changes = new EngineRecord(written);
            foreach (var pair in final)
            {
                if (written.ContainsKey(pair.Key) || stored == null || !Same(stored.Get(pair.Key), pair.Value)) changes[pair.Key] = pair.Value;
            }
            return changes;
        }

        static bool HandleProcess(SaveInput input, SaveOutcome outcome, EngineRecord state, Func<EngineRecord, ConditionScope> scopeOf, Action<EngineErrorReport> addError)
        {
            var table = input.Table;
            var before = input.Before;
            var change = input.Change;
            var now = input.Now;
            var statusField = StatusField(table);
            if (statusField == null) return before == null;
            var versions = input.Versions ?? new List<ProcessVersionRow>();
            var beforeStatus = before == null ? null : before.Get(statusField);
            var afterStatus = state.Get(statusField);

            Action<Step, bool> land = (step, keepEntered) =>
            {
                state["currentStepId"] = step.Id;
                if (!keepEntered) state["stepEnteredOn"] = now;
                state[statusField] = step.MapsTo;
            };

            if (before == null)
            {
                var usable = (input.Processes ?? new List<ProcessRow>()).Where(p =>
                {
                    var version = versions.FirstOrDefault(v => v.Id == p.LatestVersionId);
                    var criteria = version == null || version.Definition.EntryCriteria == null
                        ? new List<Check>()
                        : version.Definition.EntryCriteria.Conditions;
                    var problems = Conditions.CheckReferences(input.Fields, table, criteria);
                    foreach (var problem in problems)
                    {
                        addError(new EngineErrorReport { ProcessId = p.Id, Code = problem.Code, Message = problem.Message });
                    }
                    return problems.Count == 0;
                }).ToList();
                var picked = ProcessLogic.Pick(scopeOf(state), usable, versions);
                if (picked == null) return true;
                state["processVersionId"] = picked.Version.Id;
                var landing = ProcessLogic.LandingStep(picked.Version.Definition, Str(afterStatus));
                land(landing, false);
                RunActions(input, outcome, state, picked.Version, landing, addError);
                return true;
            }

            Func<string, bool> changed = field => change.ContainsKey(field) && !Same(before.Get(field), change[field]);

            if (changed("processVersionId"))
            {
                if (!IsOpenStatus(beforeStatus)) throw Reject("closedRecord", "A closed record keeps its Process.");
                string ownerManager = null;
                UserInfo owner;
                if (input.Users != null && input.Users.TryGetValue(Str(before.Get("ownerId")), out owner)) ownerManager = owner.ManagerId;
                if (!input.Caller.IsProcessBuilder && ownerManager != input.Caller.Id)
                {
                    throw Reject("switchNotAllowed", "Only the Owner's manager or a Process builder can switch the Process.");
                }
                if (Conditions.IsEmpty(change["processVersionId"]))
                {
                    state["processVersionId"] = null;
                    state["currentStepId"] = null;
                    state["stepEnteredOn"] = null;
                    return false;
                }
                var target = versions.FirstOrDefault(v => v.Id == (change["processVersionId"] as string));
                if (target == null) throw Reject("unknownVersion", "That Process version doesn't exist.");
                var current = versions.FirstOrDefault(v => v.Id == (before.Get("processVersionId") as string));
                var isMove = current != null && current.ProcessId == target.ProcessId;
                var step = ProcessLogic.LandingStep(target.Definition, Str(beforeStatus), isMove ? before.Get("currentStepId") as string : null);
                land(step, step.Id == (before.Get("currentStepId") as string));
                return false;
            }

            if (Conditions.IsEmpty(before.Get("processVersionId"))) return changed(statusField);
            var beforeVersionId = before.Get("processVersionId") as string;
            var currentVersion = versions.FirstOrDefault(v => v.Id == beforeVersionId);
            if (currentVersion == null)
            {
                addError(new EngineErrorReport { Code = "versionMissing", Message = "Process version " + Str(before.Get("processVersionId")) + " wasn't found." });
                return changed(statusField);
            }
            var definition = currentVersion.Definition;
            var stepChanged = changed("currentStepId");
            var statusChanged = changed(statusField);
            var beforeStepId = before.Get("currentStepId") as string;

            if (!IsOpenStatus(beforeStatus))
            {
                if (IsOpenStatus(afterStatus))
                {
                    // Reopen: carry on with the same version, on the Step that fits the Stage or status.
                    var step = ProcessLogic.LandingStep(definition, Str(afterStatus), beforeStepId);
                    land(step, step.Id == beforeStepId);
                    return false;
                }
                if (stepChanged) throw Reject("closedRecord", "A closed record can't move Step.");
                return false;
            }

            if (!IsOpenStatus(afterStatus))
            {
                // Closed Won and Qualify must pass the last Step's Gate; Closed Lost and Disqualify are never gated.
                var after = afterStatus as string;
                if (after == "closedWon" || after == "qualified")
                {
                    var last = ProcessLogic.LastStep(definition);
                    if (after == "qualified" && beforeStepId != last.Id)
                    {
                        throw Reject("qualifyNotFromLastStep",
                            "A Lead on this Process can only be qualified from its last Step, “" + last.Name + "”.",
                            stepId: last.Id);
                    }
                    CheckGate(input, currentVersion, last, state, scopeOf, addError);
                }
                state["currentStepId"] = before.Get("currentStepId");
                return statusChanged;
            }

            Step targetStep = null;
            if (stepChanged)
            {
                var wanted = change["currentStepId"] as string;
                targetStep = definition.Steps.FirstOrDefault(s => s.Id == wanted);
                if (targetStep == null) throw Reject("unknownStep", "That Step isn't part of this Process.");
                if (statusChanged && targetStep.MapsTo != (afterStatus as string))
                {
                    throw Reject("stepStatusMismatch",
                        "The Step “" + targetStep.Name + "” maps to " + targetStep.MapsTo + ", not " + Str(afterStatus) + ".");
                }
            }
            else if (statusChanged)
            {
                // A Stage or Lead status written directly moves to the first Step mapped to it.
                targetStep = definition.Steps.FirstOrDefault(s => s.MapsTo == (afterStatus as string));
                if (targetStep == null) throw Reject("noStepForStatus", "No Step of this Process maps to " + Str(afterStatus) + ".");
            }
            if (targetStep == null) return false;

            var from = ProcessLogic.StepIndex(definition, beforeStepId);
            var to = ProcessLogic.StepIndex(definition, targetStep.Id);
            if (from >= 0 && to > from)
            {
                // Moving forward: every Step left behind must pass its Gate.
                for (var i = from; i < to; i++) CheckGate(input, currentVersion, definition.Steps[i], state, scopeOf, addError);
                land(targetStep, false);
                RunActions(input, outcome, state, currentVersion, targetStep, addError);
            }
            else
            {
                land(targetStep, to == from);
            }
            return to != from || statusChanged;
        }

        static void CheckGate(SaveInput input, ProcessVersionRow version, Step step, EngineRecord state, Func<EngineRecord, ConditionScope> scopeOf, Action<EngineErrorReport> addError)
        {
            // The Gate is judged on the Step the record is leaving, so "since entering this Step" uses the stored date.
            var record = new EngineRecord(state);
            record["stepEnteredOn"] = input.Before != null && input.Before.Get("stepEnteredOn") != null
                ? input.Before.Get("stepEnteredOn")
                : state.Get("stepEnteredOn");
            var failed = ProcessLogic.GateChecklist(step, scopeOf(record))
                .Where(r => !r.Passed)
                .Where(r =>
                {
                    // A check on a removed field or choice value fails open.
                    var problem = Conditions.CheckReferences(input.Fields, input.Table, new[] { r.Check }).FirstOrDefault();
                    if (problem != null) addError(new EngineErrorReport { ProcessId = version.ProcessId, Code = problem.Code, Message = problem.Message });
                    return problem == null;
                })
                .ToList();
            if (failed.Count > 0)
            {
                throw Reject("gate",
                    failed.Count + " open " + (failed.Count == 1 ? "check" : "checks") + " on “" + step.Name + "”.",
                    stepId: step.Id, failedChecks: failed.Select(r => r.Index).ToList());
            }
        }

        static void RunActions(SaveInput input, SaveOutcome outcome, EngineRecord state, ProcessVersionRow version, Step step, Action<EngineErrorReport> addError)
        {
            Action<string, string, string> fail = (actionId, code, message) =>
                addError(new EngineErrorReport { ProcessId = version.ProcessId, ActionId = actionId, Code = code, Message = message });
            foreach (var action in step.Actions)
            {
                var setField = action as SetFieldAction;
                if (setField != null)
                {
                    var problem = Conditions.CheckFieldReference(input.Fields, input.Table, setField.Field, new[] { setField.Value });
                    if (problem != null) fail(setField.Id, problem.Code, problem.Message);
                    else state[setField.Field] = setField.Value;
                    continue;
                }
                var task = (CreateTaskAction)action;
                List<EngineRecord> tasks = null;
                if (input.Related != null) input.Related.TryGetValue("tasks", out tasks);
                var openTask = (tasks ?? new List<EngineRecord>()).Any(t => Equals(t.Get("actionId"), task.Id) && !Equals(t.Get("completed"), true));
                if (openTask) continue;
                var ownerId = state.Get("ownerId") == null ? "" : Str(state.Get("ownerId"));
                UserInfo owner = null;
                if (input.Users != null) input.Users.TryGetValue(ownerId, out owner);
                var assigneeId = task.AssignTo == "owner" ? ownerId : (owner == null ? null : owner.ManagerId);
                if (string.IsNullOrEmpty(assigneeId))
                {
                    fail(task.Id, "noManager", "The Owner has no manager to give the Task “" + task.Subject + "” to.");
                    continue;
                }
                UserInfo assignee = null;
                if (input.Users != null) input.Users.TryGetValue(assigneeId, out assignee);
                if (assignee != null && assignee.Disabled)
                {
                    fail(task.Id, "taskOwnerDisabled", "The Task “" + task.Subject + "” can't go to a disabled user.");
                    continue;
                }
                outcome.Tasks.Add(new TaskToCreate
                {
                    ActionId = task.Id,
                    StepId = step.Id,
                    Subject = task.Subject,
                    Description = string.IsNullOrEmpty(task.Description) ? null : task.Description,
                    DueDate = AddDays(input.Now, task.DueInDays),
                    OwnerId = assigneeId,
                });
            }
        }

        static void RejectAll(string code, List<FieldEffect> failures, Func<FieldEffect, string> message)
        {
            if (failures.Count == 0) return;
            throw Reject(code, string.Join(" ", failures.Select(message)), ruleIds: failures.Select(f => f.RuleId).ToList());
        }

        static void CheckRules(SaveInput input, List<BusinessRuleRow> rules, EngineRecord state, bool statusMoved, Func<EngineRecord, ConditionScope> scopeOf)
        {
            var before = input.Before;
            var change = input.Change;
            var isCreate = before == null;

            // Read-only holds while the condition holds on the stored record; it never applies on create.
            if (before != null)
            {
                var stored = Rules.EffectsOf(scopeOf(before), rules);
                RejectAll("readOnly",
                    stored.ReadOnly.Where(e => change.ContainsKey(e.Field) && !Same(before.Get(e.Field), change[e.Field])).ToList(),
                    e => Rules.ReadOnlyMessage(e.RuleName, e.Field));
            }

            var now = Rules.EffectsOf(scopeOf(state), rules);
            Func<string, bool> cleared = field =>
                change.ContainsKey(field) && Conditions.IsEmpty(change[field]) && before != null && !Conditions.IsEmpty(before.Get(field));
            RejectAll("required",
                now.Required.Where(e => Conditions.IsEmpty(state.Get(e.Field)) && (isCreate || statusMoved || cleared(e.Field))).ToList(),
                e => Rules.RequiredMessage(e.RuleName, e.Field));

            var changedFields = new HashSet<string>(state.Keys.Where(f => before == null || !Same(before.Get(f), state[f])));
            RejectAll("blockSave",
                now.Blocks.Where(e =>
                {
                    if (isCreate) return true;
                    var rule = rules.First(r => r.Id == e.RuleId);
                    return Conditions.FieldsRead(input.Table, rule.Definition.When).Any(f => changedFields.Contains(f));
                }).ToList(),
                e => Rules.BlockMessage(e.RuleName, e.Message));
        }
    }
}
