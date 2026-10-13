using System;
using System.Collections.Generic;
using System.Linq;

namespace SalesApp.Plugins.Engine
{
    // Types for the process engine. They mirror src/sales/engine/types.ts and
    // process-engine/schema/definition.schema.json. Field values are string,
    // double, bool or null; ids and dates are strings (dates as ISO text).

    public class EngineRecord : Dictionary<string, object>
    {
        public EngineRecord() : base(StringComparer.Ordinal) { }
        public EngineRecord(IDictionary<string, object> other) : base(other, StringComparer.Ordinal) { }

        public object Get(string field)
        {
            object value;
            return TryGetValue(field, out value) ? value : null;
        }
    }

    public abstract class Check
    {
        public string Id { get; set; }
    }

    public class FieldCondition : Check
    {
        public string Field { get; set; }
        public string Op { get; set; }
        /// <summary>A scalar, a List&lt;object&gt; for "isOneOf", or null.</summary>
        public object Value { get; set; }
    }

    public class RelatedCheck : Check
    {
        public string Related { get; set; }
        public int AtLeast { get; set; }
        public string Match { get; set; }
        public List<FieldCondition> Where { get; set; }
        public bool SinceStepEntered { get; set; }
    }

    public class ConditionGroup
    {
        public string Match { get; set; } = "all";
        public List<Check> Conditions { get; set; } = new List<Check>();
    }

    public abstract class StepAction
    {
        public string Id { get; set; }
    }

    public class CreateTaskAction : StepAction
    {
        public string Subject { get; set; }
        public string Description { get; set; }
        public int DueInDays { get; set; }
        public string AssignTo { get; set; }
    }

    public class SetFieldAction : StepAction
    {
        public string Field { get; set; }
        public object Value { get; set; }
    }

    public class Step
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string MapsTo { get; set; }
        public List<string> KeyFields { get; set; } = new List<string>();
        public string Guidance { get; set; }
        public List<Check> GateChecks { get; set; } = new List<Check>();
        public List<StepAction> Actions { get; set; } = new List<StepAction>();
    }

    public class ProcessDefinition
    {
        public string Table { get; set; }
        public ConditionGroup EntryCriteria { get; set; }
        public List<Step> Steps { get; set; } = new List<Step>();
    }

    public class Effect
    {
        public string Type { get; set; }
        public string Field { get; set; }
        public object Value { get; set; }
        public string Message { get; set; }
    }

    public class BusinessRuleDefinition
    {
        public string Table { get; set; }
        public ConditionGroup When { get; set; } = new ConditionGroup();
        public List<Effect> Effects { get; set; } = new List<Effect>();
    }

    public class ProcessRow
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Table { get; set; }
        public int Priority { get; set; }
        public bool IsFallback { get; set; }
        public bool Retired { get; set; }
        public string LatestVersionId { get; set; }
    }

    public class ProcessVersionRow
    {
        public string Id { get; set; }
        public string ProcessId { get; set; }
        public ProcessDefinition Definition { get; set; }
    }

    public class BusinessRuleRow
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public bool Enabled { get; set; }
        public BusinessRuleDefinition Definition { get; set; }
    }

    public class FieldInfo
    {
        public string Type { get; set; }
        public List<string> Options { get; set; }
    }

    /// <summary>Fields that exist per table; a table that is missing is not checked.</summary>
    public class FieldCatalogue : Dictionary<string, Dictionary<string, FieldInfo>>
    {
        public FieldCatalogue() : base(StringComparer.Ordinal) { }
    }

    public class UserInfo
    {
        public string ManagerId { get; set; }
        public bool Disabled { get; set; }
    }

    public class Caller
    {
        public string Id { get; set; }
        public bool IsProcessBuilder { get; set; }
    }

    public class EngineErrorReport
    {
        public string RuleId { get; set; }
        public string ProcessId { get; set; }
        public string ActionId { get; set; }
        public string Code { get; set; }
        public string Message { get; set; }
    }

    public class SaveInput
    {
        public string Table { get; set; }
        public EngineRecord Before { get; set; }
        public EngineRecord Change { get; set; } = new EngineRecord();
        public Dictionary<string, EngineRecord> Parents { get; set; }
        public Dictionary<string, List<EngineRecord>> Related { get; set; }
        public Caller Caller { get; set; } = new Caller();
        public Dictionary<string, UserInfo> Users { get; set; }
        public string Now { get; set; }
        public bool EngineEnabled { get; set; } = true;
        public List<ProcessRow> Processes { get; set; }
        public List<ProcessVersionRow> Versions { get; set; }
        public List<BusinessRuleRow> Rules { get; set; }
        public FieldCatalogue Fields { get; set; }
    }

    public class Rejection
    {
        public string Code { get; set; }
        public string Message { get; set; }
        public List<string> RuleIds { get; set; }
        public string StepId { get; set; }
        public List<int> FailedChecks { get; set; }
    }

    public class TaskToCreate
    {
        public string ActionId { get; set; }
        public string StepId { get; set; }
        public string Subject { get; set; }
        public string Description { get; set; }
        public string DueDate { get; set; }
        public string OwnerId { get; set; }
    }

    public class WarningOut
    {
        public string RuleId { get; set; }
        public string Message { get; set; }
        public string Field { get; set; }
    }

    public class SaveOutcome
    {
        public string Kind { get; set; }
        public bool Allowed { get; set; } = true;
        public Rejection Rejection { get; set; }
        public EngineRecord Changes { get; set; } = new EngineRecord();
        public List<TaskToCreate> Tasks { get; set; } = new List<TaskToCreate>();
        public List<WarningOut> Warnings { get; set; } = new List<WarningOut>();
        public List<EngineErrorReport> EngineErrors { get; set; } = new List<EngineErrorReport>();
    }
}
