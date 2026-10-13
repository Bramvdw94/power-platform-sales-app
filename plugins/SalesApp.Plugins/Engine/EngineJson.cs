using System;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace SalesApp.Plugins.Engine
{
    /// <summary>Reads the JSON shape of process-engine/schema/definition.schema.json into engine types.</summary>
    public static class EngineJson
    {
        /// <summary>Parses JSON keeping date-like text as text, as the TypeScript engine sees it.</summary>
        public static JToken Load(string json)
        {
            using (var reader = new JsonTextReader(new StringReader(json)) { DateParseHandling = DateParseHandling.None })
            {
                return JToken.Load(reader);
            }
        }

        public static object Scalar(JToken token)
        {
            if (token == null) return null;
            switch (token.Type)
            {
                case JTokenType.Null:
                case JTokenType.Undefined:
                    return null;
                case JTokenType.Integer:
                case JTokenType.Float:
                    return token.Value<double>();
                case JTokenType.Boolean:
                    return token.Value<bool>();
                case JTokenType.Array:
                    return token.Select(Scalar).ToList();
                default:
                    return token.Value<string>();
            }
        }

        public static EngineRecord ToRecord(JToken token)
        {
            var record = new EngineRecord();
            var obj = token as JObject;
            if (obj == null) return record;
            foreach (var property in obj.Properties()) record[property.Name] = Scalar(property.Value);
            return record;
        }

        static string Text(JToken token, string name) => token[name] == null || token[name].Type == JTokenType.Null ? null : token[name].Value<string>();

        public static FieldCondition ParseField(JToken token)
        {
            return new FieldCondition
            {
                Id = Text(token, "id"),
                Field = Text(token, "field"),
                Op = Text(token, "op"),
                Value = Scalar(token["value"]),
            };
        }

        public static Check ParseCheck(JToken token)
        {
            if (token["related"] == null) return ParseField(token);
            return new RelatedCheck
            {
                Id = Text(token, "id"),
                Related = Text(token, "related"),
                AtLeast = token["atLeast"].Value<int>(),
                Match = Text(token, "match"),
                Where = (token["where"] as JArray ?? new JArray()).Select(ParseField).ToList(),
                SinceStepEntered = token["sinceStepEntered"] != null && token["sinceStepEntered"].Value<bool>(),
            };
        }

        public static ConditionGroup ParseGroup(JToken token)
        {
            if (token == null || token.Type == JTokenType.Null) return null;
            return new ConditionGroup
            {
                Match = Text(token, "match") ?? "all",
                Conditions = (token["conditions"] as JArray ?? new JArray()).Select(ParseCheck).ToList(),
            };
        }

        static StepAction ParseAction(JToken token)
        {
            if (Text(token, "type") == "setField")
            {
                return new SetFieldAction { Id = Text(token, "id"), Field = Text(token, "field"), Value = Scalar(token["value"]) };
            }
            return new CreateTaskAction
            {
                Id = Text(token, "id"),
                Subject = Text(token, "subject"),
                Description = Text(token, "description"),
                DueInDays = token["dueInDays"].Value<int>(),
                AssignTo = Text(token, "assignTo"),
            };
        }

        static Step ParseStep(JToken token)
        {
            return new Step
            {
                Id = Text(token, "id"),
                Name = Text(token, "name"),
                MapsTo = Text(token, "mapsTo"),
                KeyFields = (token["keyFields"] as JArray ?? new JArray()).Select(t => t.Value<string>()).ToList(),
                Guidance = Text(token, "guidance"),
                GateChecks = token["gate"] == null ? new List<Check>() : (token["gate"]["checks"] as JArray ?? new JArray()).Select(ParseCheck).ToList(),
                Actions = (token["actions"] as JArray ?? new JArray()).Select(ParseAction).ToList(),
            };
        }

        public static ProcessDefinition ParseProcess(JToken token)
        {
            return new ProcessDefinition
            {
                Table = Text(token, "table"),
                EntryCriteria = ParseGroup(token["entryCriteria"]),
                Steps = (token["steps"] as JArray ?? new JArray()).Select(ParseStep).ToList(),
            };
        }

        public static ProcessDefinition ParseProcess(string json) => ParseProcess(Load(json));

        public static BusinessRuleDefinition ParseRule(JToken token)
        {
            return new BusinessRuleDefinition
            {
                Table = Text(token, "table"),
                When = ParseGroup(token["when"]) ?? new ConditionGroup(),
                Effects = (token["effects"] as JArray ?? new JArray()).Select(e => new Effect
                {
                    Type = Text(e, "type"),
                    Field = Text(e, "field"),
                    Value = Scalar(e["value"]),
                    Message = Text(e, "message"),
                }).ToList(),
            };
        }

        public static BusinessRuleDefinition ParseRule(string json) => ParseRule(Load(json));
    }
}
