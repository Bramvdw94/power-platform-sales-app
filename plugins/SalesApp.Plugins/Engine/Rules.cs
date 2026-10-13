using System.Collections.Generic;
using System.Linq;

namespace SalesApp.Plugins.Engine
{
    public class FieldEffect
    {
        public string RuleId { get; set; }
        public string RuleName { get; set; }
        public string Field { get; set; }
        public string Message { get; set; }
    }

    public class RuleEffects
    {
        public List<FieldEffect> Required { get; } = new List<FieldEffect>();
        public List<FieldEffect> ReadOnly { get; } = new List<FieldEffect>();
        public List<FieldEffect> SetValues { get; } = new List<FieldEffect>();
        public List<FieldEffect> Warnings { get; } = new List<FieldEffect>();
        public List<FieldEffect> Blocks { get; } = new List<FieldEffect>();
    }

    public static class Rules
    {
        public static ReferenceProblem RuleProblem(BusinessRuleRow rule, FieldCatalogue catalogue)
        {
            var table = rule.Definition.Table;
            var conditionProblem = Conditions.CheckReferences(catalogue, table, rule.Definition.When.Conditions).FirstOrDefault();
            if (conditionProblem != null) return conditionProblem;
            foreach (var effect in rule.Definition.Effects)
            {
                if (string.IsNullOrEmpty(effect.Field)) continue;
                var values = effect.Type == "setValue" ? new[] { effect.Value } : new object[0];
                var problem = Conditions.CheckFieldReference(catalogue, table, effect.Field, values);
                if (problem != null) return problem;
            }
            return null;
        }

        /// <summary>The enabled rules of a table that can run, plus an Engine error for each one that can't (it fails open).</summary>
        public static List<BusinessRuleRow> Runnable(string table, IEnumerable<BusinessRuleRow> rules, FieldCatalogue catalogue, List<EngineErrorReport> errors)
        {
            var runnable = new List<BusinessRuleRow>();
            foreach (var rule in rules)
            {
                if (!rule.Enabled || rule.Definition.Table != table) continue;
                var problem = RuleProblem(rule, catalogue);
                if (problem != null) errors.Add(new EngineErrorReport { RuleId = rule.Id, Code = problem.Code, Message = problem.Message });
                else runnable.Add(rule);
            }
            return runnable;
        }

        public static RuleEffects EffectsOf(ConditionScope scope, IEnumerable<BusinessRuleRow> runnableRules)
        {
            var effects = new RuleEffects();
            foreach (var rule in runnableRules)
            {
                if (!Conditions.ConditionsHold(scope, rule.Definition.When)) continue;
                foreach (var effect in rule.Definition.Effects)
                {
                    var item = new FieldEffect { RuleId = rule.Id, RuleName = rule.Name, Field = effect.Field, Message = effect.Message };
                    switch (effect.Type)
                    {
                        case "required": effects.Required.Add(item); break;
                        case "readOnly": effects.ReadOnly.Add(item); break;
                        case "setValue": effects.SetValues.Add(item); break;
                        case "warning": effects.Warnings.Add(item); break;
                        case "blockSave": effects.Blocks.Add(item); break;
                    }
                }
            }
            return effects;
        }

        public static string BlockMessage(string ruleName, string message) => "Blocked by the rule “" + ruleName + "”: " + message;
        public static string RequiredMessage(string ruleName, string field) => field + " is required by the rule “" + ruleName + "”.";
        public static string ReadOnlyMessage(string ruleName, string field) => field + " is read-only because of the rule “" + ruleName + "”.";
    }
}
