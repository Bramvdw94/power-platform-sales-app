using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace SalesApp.Plugins.Engine
{
    public class ReferenceProblem
    {
        public string Code { get; set; }
        public string Field { get; set; }
        public string Message { get; set; }
    }

    public class ConditionScope
    {
        public string Table { get; set; }
        public EngineRecord EngineRecord { get; set; }
        public Dictionary<string, EngineRecord> Parents { get; set; }
        public Dictionary<string, List<EngineRecord>> Related { get; set; }
    }

    public static class Conditions
    {
        public class ParentLink
        {
            public string Table { get; set; }
            public string Lookup { get; set; }
        }

        public static readonly Dictionary<string, Dictionary<string, ParentLink>> Parents =
            new Dictionary<string, Dictionary<string, ParentLink>>
            {
                ["lead"] = new Dictionary<string, ParentLink>(),
                ["opportunity"] = new Dictionary<string, ParentLink>
                {
                    ["account"] = new ParentLink { Table = "account", Lookup = "accountId" },
                    ["primaryContact"] = new ParentLink { Table = "contact", Lookup = "primaryContactId" },
                    ["originatingLead"] = new ParentLink { Table = "lead", Lookup = "originatingLeadId" },
                },
                ["account"] = new Dictionary<string, ParentLink>(),
                ["contact"] = new Dictionary<string, ParentLink>
                {
                    ["account"] = new ParentLink { Table = "account", Lookup = "accountId" },
                },
            };

        public static readonly Dictionary<string, Dictionary<string, string>> RelatedLists =
            new Dictionary<string, Dictionary<string, string>>
            {
                ["lead"] = new Dictionary<string, string> { ["tasks"] = "task", ["phoneCalls"] = "phoneCall", ["notes"] = "note" },
                ["opportunity"] = new Dictionary<string, string>
                {
                    ["tasks"] = "task", ["phoneCalls"] = "phoneCall", ["notes"] = "note", ["productLines"] = "productLine", ["quotes"] = "quote",
                },
                ["account"] = new Dictionary<string, string>
                {
                    ["tasks"] = "task", ["phoneCalls"] = "phoneCall", ["notes"] = "note", ["contacts"] = "contact", ["opportunities"] = "opportunity",
                },
                ["contact"] = new Dictionary<string, string> { ["tasks"] = "task", ["phoneCalls"] = "phoneCall", ["notes"] = "note" },
            };

        public static readonly string[] ActivityLists = { "tasks", "phoneCalls", "notes" };

        public static readonly string[] EngineColumns = { "processVersionId", "currentStepId", "stepEnteredOn" };

        public static readonly string[] NotUsableFields =
        {
            "id", "ownerId", "ownerName", "createdOn", "modifiedOn", "stage", "status", "actualValue", "closeDate",
            "lostReason", "lostComment", "closedById", "closedByName", "disqualifyReason", "disqualifyComment",
            "disqualifiedOn", "disqualifiedById", "accountName", "primaryContactName",
            "processVersionId", "currentStepId", "stepEnteredOn",
        };

        static readonly Regex DatePattern = new Regex(@"^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$", RegexOptions.Compiled);

        public static bool IsEmpty(object value)
        {
            if (value == null) return true;
            var text = value as string;
            return text != null && text.Trim().Length == 0;
        }

        /// <summary>Equality as the TypeScript engine's === on scalars: numbers by value, text exactly.</summary>
        public static bool Same(object a, object b)
        {
            if (IsEmpty(a) && IsEmpty(b)) return true;
            if (a == null || b == null) return false;
            if (IsNumber(a) && IsNumber(b)) return ToDouble(a) == ToDouble(b);
            if (a is bool && b is bool) return (bool)a == (bool)b;
            var sa = a as string;
            var sb = b as string;
            return sa != null && sb != null && string.Equals(sa, sb, StringComparison.Ordinal);
        }

        static bool IsNumber(object v) => v is double || v is int || v is long || v is decimal || v is float;
        static double ToDouble(object v) => Convert.ToDouble(v, CultureInfo.InvariantCulture);

        static double? AsComparable(object value)
        {
            if (IsNumber(value)) return ToDouble(value);
            var text = value as string;
            if (text != null && DatePattern.IsMatch(text))
            {
                DateTimeOffset parsed;
                var input = text.Length == 10 ? text + "T00:00:00Z" : text;
                if (DateTimeOffset.TryParse(input, CultureInfo.InvariantCulture,
                        DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out parsed))
                {
                    return parsed.ToUnixTimeMilliseconds();
                }
            }
            return null;
        }

        static bool SameValue(object a, object b) => !IsEmpty(a) && Same(a, b);

        public static bool Compare(object value, string op, object target)
        {
            switch (op)
            {
                case "isEmpty": return IsEmpty(value);
                case "isNotEmpty": return !IsEmpty(value);
                case "equals": return SameValue(value, target);
                case "isNot": return !SameValue(value, target);
                case "isOneOf":
                {
                    var list = target as List<object>;
                    if (list == null) list = new List<object> { target };
                    return list.Any(t => SameValue(value, t));
                }
                case "greaterThan":
                case "lessThan":
                {
                    if (IsEmpty(value)) return false;
                    var left = AsComparable(value);
                    var right = AsComparable(target);
                    if (left == null || right == null) return false;
                    return op == "greaterThan" ? left > right : left < right;
                }
            }
            return false;
        }

        public static object FieldValue(ConditionScope scope, string reference)
        {
            var dot = reference.IndexOf('.');
            if (dot < 0) return scope.EngineRecord.Get(reference);
            EngineRecord parent = null;
            if (scope.Parents != null) scope.Parents.TryGetValue(reference.Substring(0, dot), out parent);
            return parent == null ? null : parent.Get(reference.Substring(dot + 1));
        }

        static bool RelatedCheckHolds(ConditionScope scope, RelatedCheck check)
        {
            List<EngineRecord> items = null;
            if (scope.Related != null) scope.Related.TryGetValue(check.Related, out items);
            items = items ?? new List<EngineRecord>();
            var since = scope.EngineRecord.Get("stepEnteredOn") as string;
            if (check.SinceStepEntered && !string.IsNullOrEmpty(since))
            {
                var from = AsComparable(since);
                items = items.Where(item =>
                {
                    var created = item.Get("createdOn") as string;
                    var createdMs = created == null ? null : AsComparable(created);
                    return createdMs != null && from != null && createdMs >= from;
                }).ToList();
            }
            var where = check.Where ?? new List<FieldCondition>();
            var matching = items.Count(item =>
                GroupHolds(check.Match ?? "all", where.Select(c => Compare(item.Get(c.Field), c.Op, c.Value)).ToList()));
            return matching >= check.AtLeast;
        }

        public static bool CheckHolds(ConditionScope scope, Check check)
        {
            var related = check as RelatedCheck;
            if (related != null) return RelatedCheckHolds(scope, related);
            var field = (FieldCondition)check;
            return Compare(FieldValue(scope, field.Field), field.Op, field.Value);
        }

        static bool GroupHolds(string match, List<bool> results)
        {
            if (results.Count == 0) return true;
            return match == "all" ? results.All(r => r) : results.Any(r => r);
        }

        public static bool ConditionsHold(ConditionScope scope, ConditionGroup group)
        {
            return GroupHolds(group.Match, group.Conditions.Select(c => CheckHolds(scope, c)).ToList());
        }

        public static HashSet<string> FieldsRead(string table, ConditionGroup group)
        {
            var fields = new HashSet<string>();
            foreach (var check in group.Conditions)
            {
                var field = check as FieldCondition;
                if (field == null) continue;
                var dot = field.Field.IndexOf('.');
                if (dot < 0) fields.Add(field.Field);
                else
                {
                    ParentLink link;
                    if (Parents[table].TryGetValue(field.Field.Substring(0, dot), out link)) fields.Add(link.Lookup);
                }
            }
            return fields;
        }

        static object Resolve(string table, string reference, out string resolvedTable, out string field)
        {
            resolvedTable = table;
            field = reference;
            var dot = reference.IndexOf('.');
            if (dot < 0) return null;
            var parentName = reference.Substring(0, dot);
            ParentLink parent;
            if (!Parents[table].TryGetValue(parentName, out parent))
            {
                return new ReferenceProblem
                {
                    Code = "parentNotAllowed", Field = reference,
                    Message = "A " + table + " has no parent \"" + parentName + "\".",
                };
            }
            resolvedTable = parent.Table;
            field = reference.Substring(dot + 1);
            return null;
        }

        public static ReferenceProblem CheckFieldReference(FieldCatalogue catalogue, string table, string reference, IEnumerable<object> values = null)
        {
            string resolvedTable = table;
            string field = reference;
            if (Parents.ContainsKey(table))
            {
                var problem = Resolve(table, reference, out resolvedTable, out field) as ReferenceProblem;
                if (problem != null) return problem;
            }
            if (NotUsableFields.Contains(field))
            {
                return new ReferenceProblem
                {
                    Code = "fieldNotUsable", Field = reference,
                    Message = "The field \"" + reference + "\" can't be used in a Process or Business rule.",
                };
            }
            Dictionary<string, FieldInfo> fields = null;
            if (catalogue == null || !catalogue.TryGetValue(resolvedTable, out fields)) return null;
            FieldInfo info;
            if (!fields.TryGetValue(field, out info))
            {
                return new ReferenceProblem
                {
                    Code = "fieldMissing", Field = reference,
                    Message = "The field \"" + reference + "\" no longer exists.",
                };
            }
            if (info.Type == "choice" && info.Options != null && values != null)
            {
                foreach (var value in values)
                {
                    var text = value as string;
                    if (text != null && !info.Options.Contains(text))
                    {
                        return new ReferenceProblem
                        {
                            Code = "choiceMissing", Field = reference,
                            Message = "The choice \"" + text + "\" no longer exists for \"" + reference + "\".",
                        };
                    }
                }
            }
            return null;
        }

        static IEnumerable<object> ConditionValues(FieldCondition condition)
        {
            if (condition.Value == null) return new object[0];
            var list = condition.Value as List<object>;
            return list ?? new List<object> { condition.Value };
        }

        public static List<ReferenceProblem> CheckReferences(FieldCatalogue catalogue, string table, IEnumerable<Check> checks)
        {
            var problems = new List<ReferenceProblem>();
            foreach (var check in checks)
            {
                var related = check as RelatedCheck;
                if (related != null)
                {
                    string itemTable;
                    if (!RelatedLists[table].TryGetValue(related.Related, out itemTable))
                    {
                        problems.Add(new ReferenceProblem
                        {
                            Code = "relatedNotAllowed", Field = related.Related,
                            Message = "A " + table + " has no related list \"" + related.Related + "\".",
                        });
                        continue;
                    }
                    foreach (var c in related.Where ?? new List<FieldCondition>())
                    {
                        var problem = CheckFieldReference(catalogue, itemTable, c.Field, ConditionValues(c));
                        if (problem != null && problem.Code != "fieldNotUsable")
                        {
                            problems.Add(new ReferenceProblem { Code = problem.Code, Message = problem.Message, Field = related.Related + "." + c.Field });
                        }
                    }
                    continue;
                }
                var condition = (FieldCondition)check;
                var p = CheckFieldReference(catalogue, table, condition.Field, ConditionValues(condition));
                if (p != null) problems.Add(p);
            }
            return problems;
        }
    }
}
