using System;
using System.Collections.Generic;
using System.Linq;

namespace SalesApp.Plugins.Engine
{
    public class GateCheckResult
    {
        public Check Check { get; set; }
        public int Index { get; set; }
        public bool Passed { get; set; }
    }

    public class PickedProcess
    {
        public ProcessRow Process { get; set; }
        public ProcessVersionRow Version { get; set; }
    }

    public static class ProcessLogic
    {
        public static readonly Dictionary<string, int> StepStatusOrder = new Dictionary<string, int>
        {
            ["notContacted"] = 0, ["working"] = 1,
            ["qualification"] = 0, ["needsAnalysis"] = 1, ["proposal"] = 2, ["negotiation"] = 3,
        };

        /// <summary>The Process a new record gets: the first matching Entry criteria in priority order, else the fallback, else none.</summary>
        public static PickedProcess Pick(ConditionScope scope, IEnumerable<ProcessRow> processes, IEnumerable<ProcessVersionRow> versions)
        {
            var candidates = processes
                .Where(p => p.Table == scope.Table && !p.Retired && p.LatestVersionId != null)
                .OrderBy(p => p.Priority)
                .ToList();
            var versionList = versions.ToList();
            Func<ProcessRow, ProcessVersionRow> versionOf = p => versionList.FirstOrDefault(v => v.Id == p.LatestVersionId);
            var withoutRelated = new ConditionScope { Table = scope.Table, EngineRecord = scope.EngineRecord, Parents = scope.Parents };
            foreach (var process in candidates)
            {
                if (process.IsFallback) continue;
                var version = versionOf(process);
                var criteria = version == null ? null : version.Definition.EntryCriteria;
                if (version != null && criteria != null && Conditions.ConditionsHold(withoutRelated, criteria))
                {
                    return new PickedProcess { Process = process, Version = version };
                }
            }
            var fallback = candidates.FirstOrDefault(p => p.IsFallback);
            var fallbackVersion = fallback == null ? null : versionOf(fallback);
            return fallback != null && fallbackVersion != null
                ? new PickedProcess { Process = fallback, Version = fallbackVersion }
                : null;
        }

        public static Step LandingStep(ProcessDefinition definition, string status, string keepStepId = null)
        {
            var steps = definition.Steps;
            if (!string.IsNullOrEmpty(keepStepId))
            {
                var kept = steps.FirstOrDefault(s => s.Id == keepStepId && s.MapsTo == status);
                if (kept != null) return kept;
            }
            var exact = steps.FirstOrDefault(s => s.MapsTo == status);
            if (exact != null) return exact;
            int order;
            if (StepStatusOrder.TryGetValue(status, out order))
            {
                var earlier = steps.Where(s => StepStatusOrder[s.MapsTo] < order).ToList();
                if (earlier.Count > 0) return earlier[earlier.Count - 1];
            }
            return steps[0];
        }

        public static int StepIndex(ProcessDefinition definition, string stepId)
        {
            return string.IsNullOrEmpty(stepId) ? -1 : definition.Steps.FindIndex(s => s.Id == stepId);
        }

        public static Step LastStep(ProcessDefinition definition) => definition.Steps[definition.Steps.Count - 1];

        public static List<GateCheckResult> GateChecklist(Step step, ConditionScope scope)
        {
            return step.GateChecks
                .Select((check, index) => new GateCheckResult { Check = check, Index = index, Passed = Conditions.CheckHolds(scope, check) })
                .ToList();
        }
    }
}
