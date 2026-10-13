using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Json.Schema;
using Newtonsoft.Json.Linq;
using SalesApp.Plugins.Engine;
using Xunit;

namespace SalesApp.Plugins.Tests
{
    /// <summary>
    /// Runs the shared engine cases in process-engine/cases, the same files the TypeScript
    /// engine runs in Vitest (src/sales/engine/engine-cases.test.ts). Publish checks happen
    /// in the app only, so publishProcess / publishRule cases are not run here.
    /// </summary>
    public class EngineCasesTests
    {
        static readonly string Root = FindRoot();

        static string FindRoot()
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null && !Directory.Exists(Path.Combine(dir.FullName, "process-engine", "cases"))) dir = dir.Parent;
            if (dir == null) throw new InvalidOperationException("process-engine/cases not found above " + AppContext.BaseDirectory);
            return Path.Combine(dir.FullName, "process-engine");
        }

        static readonly string[] RunTypes = { "schema", "condition", "pick", "save" };

        public static IEnumerable<object[]> Cases()
        {
            foreach (var file in Directory.GetFiles(Path.Combine(Root, "cases"), "*.json").OrderBy(f => f, StringComparer.Ordinal))
            {
                foreach (var c in (JArray)EngineJson.Load(File.ReadAllText(file)))
                {
                    if (RunTypes.Contains((string)c["type"])) yield return new object[] { Path.GetFileName(file), (string)c["name"] };
                }
            }
        }

        static JToken Find(string file, string name)
        {
            return ((JArray)EngineJson.Load(File.ReadAllText(Path.Combine(Root, "cases", file)))).First(c => (string)c["name"] == name);
        }

        static readonly Lazy<JsonSchema> ProcessSchema = new Lazy<JsonSchema>(() => Schema("processDefinition"));
        static readonly Lazy<JsonSchema> RuleSchema = new Lazy<JsonSchema>(() => Schema("businessRuleDefinition"));

        static JsonSchema Schema(string definition)
        {
            var root = JObject.Parse(File.ReadAllText(Path.Combine(Root, "schema", "definition.schema.json")));
            // Point the root at one definition and keep the rest of the document for $ref lookups.
            root["$ref"] = "#/definitions/" + definition;
            return JsonSchema.FromText(root.ToString());
        }

        static bool Valid(JsonSchema schema, JToken definition)
        {
            using (var doc = System.Text.Json.JsonDocument.Parse(definition.ToString()))
            {
                return schema.Evaluate(doc.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.Flag }).IsValid;
            }
        }

        [Fact]
        public void The_case_folder_has_cases()
        {
            Assert.NotEmpty(Cases());
        }

        [Fact]
        public void Case_names_are_unique_and_say_what_they_cover()
        {
            foreach (var file in Directory.GetFiles(Path.Combine(Root, "cases"), "*.json"))
            {
                var cases = (JArray)EngineJson.Load(File.ReadAllText(file));
                Assert.Equal(cases.Count, cases.Select(c => (string)c["name"]).Distinct().Count());
                foreach (var c in cases) Assert.True(((JArray)c["covers"]).Count > 0, (string)c["name"]);
            }
        }

        [Theory]
        [MemberData(nameof(Cases))]
        public void Shared_case(string file, string name)
        {
            var c = Find(file, name);
            var input = c["input"];
            var expect = c["expect"];
            switch ((string)c["type"])
            {
                case "schema":
                {
                    var schema = (string)input["kind"] == "process" ? ProcessSchema.Value : RuleSchema.Value;
                    Assert.Equal((bool)expect["valid"], Valid(schema, input["definition"]));
                    break;
                }
                case "condition":
                {
                    var scope = new ConditionScope
                    {
                        Table = (string)input["table"],
                        EngineRecord = EngineJson.ToRecord(input["record"]),
                        Parents = Parents(input["parents"]),
                        Related = Related(input["related"]),
                    };
                    Assert.Equal((bool)expect["holds"], Conditions.ConditionsHold(scope, EngineJson.ParseGroup(input["group"])));
                    break;
                }
                case "pick":
                {
                    var scope = new ConditionScope
                    {
                        Table = (string)input["table"],
                        EngineRecord = EngineJson.ToRecord(input["record"]),
                        Parents = Parents(input["parents"]),
                    };
                    var picked = ProcessLogic.Pick(scope, ProcessRows(input["processes"]), VersionRows(input["versions"]));
                    Assert.Equal(expect["processId"].Type == JTokenType.Null ? null : (string)expect["processId"], picked == null ? null : picked.Process.Id);
                    if (expect["versionId"] != null) Assert.Equal((string)expect["versionId"], picked.Version.Id);
                    break;
                }
                case "save":
                    RunSave(input, expect);
                    break;
            }
        }

        static void RunSave(JToken input, JToken expect)
        {
            foreach (var v in (JArray)(input["versions"] ?? new JArray()))
            {
                Assert.True(Valid(ProcessSchema.Value, v["definition"]), (string)v["id"] + " is not a valid Process definition");
            }
            foreach (var r in (JArray)(input["rules"] ?? new JArray()))
            {
                Assert.True(Valid(RuleSchema.Value, r["definition"]), (string)r["id"] + " is not a valid rule definition");
            }

            var outcome = SaveLogic.Evaluate(ToSaveInput(input));
            var actual = OutcomeJson(outcome);

            var rest = (JObject)expect.DeepClone();
            var errorCodes = rest["engineErrorCodes"];
            var taskCount = rest["taskCount"];
            var warningMessages = rest["warningMessages"];
            rest.Remove("engineErrorCodes");
            rest.Remove("taskCount");
            rest.Remove("warningMessages");

            if (errorCodes != null)
            {
                Assert.Equal(errorCodes.Select(t => (string)t).OrderBy(x => x, StringComparer.Ordinal),
                    outcome.EngineErrors.Select(e => e.Code).OrderBy(x => x, StringComparer.Ordinal));
            }
            if (taskCount != null) Assert.Equal((int)taskCount, outcome.Tasks.Count);
            if (warningMessages != null)
            {
                Assert.Equal(warningMessages.Select(t => (string)t).OrderBy(x => x, StringComparer.Ordinal),
                    outcome.Warnings.Select(w => w.Message).OrderBy(x => x, StringComparer.Ordinal));
            }
            Assert.True(Matches(actual, rest), "Expected " + rest + " but the outcome was " + actual);
        }

        /// <summary>Every key in expected must match actual; arrays must match element by element and in length.</summary>
        static bool Matches(JToken actual, JToken expected)
        {
            switch (expected.Type)
            {
                case JTokenType.Array:
                {
                    var list = actual as JArray;
                    if (list == null || list.Count != expected.Count()) return false;
                    return expected.Select((e, i) => Matches(list[i], e)).All(x => x);
                }
                case JTokenType.Object:
                {
                    var obj = actual as JObject;
                    if (obj == null) return false;
                    return ((JObject)expected).Properties().All(p => Matches(obj[p.Name] ?? JValue.CreateNull(), p.Value));
                }
                case JTokenType.Null:
                    return actual == null || actual.Type == JTokenType.Null;
                default:
                    if (actual == null) return false;
                    if (IsNumber(actual) && IsNumber(expected)) return (double)actual == (double)expected;
                    return JToken.DeepEquals(actual, expected);
            }
        }

        static bool IsNumber(JToken t) => t.Type == JTokenType.Integer || t.Type == JTokenType.Float;

        static JObject OutcomeJson(SaveOutcome outcome)
        {
            var result = new JObject
            {
                ["kind"] = outcome.Kind,
                ["allowed"] = outcome.Allowed,
                ["changes"] = RecordJson(outcome.Changes),
                ["tasks"] = new JArray(outcome.Tasks.Select(t =>
                {
                    var task = new JObject
                    {
                        ["actionId"] = t.ActionId, ["stepId"] = t.StepId, ["subject"] = t.Subject, ["dueDate"] = t.DueDate, ["ownerId"] = t.OwnerId,
                    };
                    if (t.Description != null) task["description"] = t.Description;
                    return task;
                })),
                ["warnings"] = new JArray(outcome.Warnings.Select(w =>
                {
                    var warning = new JObject { ["ruleId"] = w.RuleId, ["message"] = w.Message };
                    if (w.Field != null) warning["field"] = w.Field;
                    return warning;
                })),
            };
            if (outcome.Rejection != null)
            {
                var r = new JObject { ["code"] = outcome.Rejection.Code, ["message"] = outcome.Rejection.Message };
                if (outcome.Rejection.StepId != null) r["stepId"] = outcome.Rejection.StepId;
                if (outcome.Rejection.FailedChecks != null) r["failedChecks"] = new JArray(outcome.Rejection.FailedChecks);
                if (outcome.Rejection.RuleIds != null) r["ruleIds"] = new JArray(outcome.Rejection.RuleIds);
                result["rejection"] = r;
            }
            return result;
        }

        static JObject RecordJson(EngineRecord record)
        {
            var obj = new JObject();
            foreach (var pair in record) obj[pair.Key] = pair.Value == null ? JValue.CreateNull() : JToken.FromObject(pair.Value);
            return obj;
        }

        static Dictionary<string, EngineRecord> Parents(JToken token)
        {
            if (token == null || token.Type == JTokenType.Null) return null;
            return ((JObject)token).Properties().ToDictionary(p => p.Name, p => p.Value.Type == JTokenType.Null ? null : EngineJson.ToRecord(p.Value));
        }

        static Dictionary<string, List<EngineRecord>> Related(JToken token)
        {
            if (token == null || token.Type == JTokenType.Null) return null;
            return ((JObject)token).Properties().ToDictionary(p => p.Name, p => p.Value.Select(EngineJson.ToRecord).ToList());
        }

        static List<ProcessRow> ProcessRows(JToken token)
        {
            return (token ?? new JArray()).Select(p => new ProcessRow
            {
                Id = (string)p["id"], Name = (string)p["name"], Table = (string)p["table"],
                Priority = p["priority"] == null ? 0 : (int)p["priority"],
                IsFallback = p["isFallback"] != null && (bool)p["isFallback"],
                Retired = p["retired"] != null && (bool)p["retired"],
                LatestVersionId = p["latestVersionId"] == null || p["latestVersionId"].Type == JTokenType.Null ? null : (string)p["latestVersionId"],
            }).ToList();
        }

        static List<ProcessVersionRow> VersionRows(JToken token)
        {
            return (token ?? new JArray()).Select(v => new ProcessVersionRow
            {
                Id = (string)v["id"], ProcessId = (string)v["processId"], Definition = EngineJson.ParseProcess(v["definition"]),
            }).ToList();
        }

        static SaveInput ToSaveInput(JToken input)
        {
            var save = new SaveInput
            {
                Table = (string)input["table"],
                Before = input["before"] == null || input["before"].Type == JTokenType.Null ? null : EngineJson.ToRecord(input["before"]),
                Change = EngineJson.ToRecord(input["change"]),
                Parents = Parents(input["parents"]),
                Related = Related(input["related"]),
                Caller = new Caller
                {
                    Id = (string)input["caller"]["id"],
                    IsProcessBuilder = input["caller"]["isProcessBuilder"] != null && (bool)input["caller"]["isProcessBuilder"],
                },
                Now = (string)input["now"],
                EngineEnabled = input["engineEnabled"] == null || (bool)input["engineEnabled"],
                Processes = ProcessRows(input["processes"]),
                Versions = VersionRows(input["versions"]),
                Rules = (input["rules"] ?? new JArray()).Select(r => new BusinessRuleRow
                {
                    Id = (string)r["id"], Name = (string)r["name"], Enabled = (bool)r["enabled"], Definition = EngineJson.ParseRule(r["definition"]),
                }).ToList(),
            };
            save.Users = new Dictionary<string, UserInfo>();
            foreach (var p in ((JObject)(input["users"] ?? new JObject())).Properties())
            {
                save.Users[p.Name] = new UserInfo
                {
                    ManagerId = p.Value["managerId"] == null || p.Value["managerId"].Type == JTokenType.Null ? null : (string)p.Value["managerId"],
                    Disabled = p.Value["disabled"] != null && (bool)p.Value["disabled"],
                };
            }
            if (input["fields"] != null)
            {
                save.Fields = new FieldCatalogue();
                foreach (var table in ((JObject)input["fields"]).Properties())
                {
                    var fields = new Dictionary<string, FieldInfo>();
                    foreach (var f in ((JObject)table.Value).Properties())
                    {
                        fields[f.Name] = new FieldInfo
                        {
                            Type = (string)f.Value["type"],
                            Options = f.Value["options"] == null ? null : f.Value["options"].Select(o => (string)o).ToList(),
                        };
                    }
                    save.Fields[table.Name] = fields;
                }
            }
            return save;
        }
    }
}
