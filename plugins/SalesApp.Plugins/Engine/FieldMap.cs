using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace SalesApp.Plugins.Engine
{
    public enum FieldKind { Text, Number, Money, Date, DateTime, Choice, Lookup, Bool, AccountType, Industry, StateDone, Direction, QuoteStatus }

    public class FieldDef
    {
        public string Name { get; set; }
        public string Column { get; set; }
        public FieldKind Kind { get; set; }
        public string[] Options { get; set; }
        public string LookupTable { get; set; }
    }

    /// <summary>
    /// How the engine's field names (src/sales/types.ts) map onto Dataverse columns of
    /// the four engine tables and the related lists their conditions can count.
    /// </summary>
    public static class FieldMap
    {
        public const int ChoiceBase = 841200000;

        public static readonly string[] LeadSources = { "website", "referral", "event", "coldOutreach", "partner", "other" };
        public static readonly string[] LeadStatuses = { "notContacted", "working", "qualified", "disqualified" };
        public static readonly string[] DisqualifyReasons = { "noBudget", "noNeed", "cantReachThem", "choseCompetitor", "duplicate", "other" };
        public static readonly string[] Stages = { "qualification", "needsAnalysis", "proposal", "negotiation", "closedWon", "closedLost" };
        public static readonly string[] ForecastCategories = { "pipeline", "bestCase", "commit", "omitted" };
        public static readonly string[] LostReasons = { "price", "choseCompetitor", "noBudget", "noDecision", "other" };
        /// <summary>A Quote's status reasons 1 to 5, in order. Its status is the table's own statuscode, not a choice column.</summary>
        public static readonly string[] QuoteStatuses = { "draft", "sent", "accepted", "rejected", "revised" };
        public static readonly string[] AccountTypes = { "prospect", "customer", "partner", "reseller", "supplier", "competitor", "other" };
        public static readonly int[] AccountTypeCodes = { 8, 3, 5, 9, 10, 1, 12 };
        public static readonly string[] Industries =
        {
            "accounting", "agriculture", "broadcastingPublishing", "brokers", "buildingSupplyRetail", "businessServices",
            "consulting", "consumerServices", "design", "distributors", "medicalOffices", "durableManufacturing",
            "eatingDrinking", "entertainmentRetail", "equipmentRental", "financial", "foodTobacco", "capitalIntensiveProcessing",
            "repairServices", "insurance", "legalServices", "nonDurableRetail", "outboundConsumerService", "petrochemical",
            "serviceRetail", "sigAffiliations", "socialServices", "tradeContractors", "specialtyRealty", "transportation",
            "utilities", "vehicleRetail", "wholesale",
        };

        static FieldDef T(string name, string column) => new FieldDef { Name = name, Column = column, Kind = FieldKind.Text };
        static FieldDef C(string name, string column, string[] options) => new FieldDef { Name = name, Column = column, Kind = FieldKind.Choice, Options = options };
        static FieldDef L(string name, string column, string table) => new FieldDef { Name = name, Column = column, Kind = FieldKind.Lookup, LookupTable = table };
        static FieldDef D(string name, string column, FieldKind kind) => new FieldDef { Name = name, Column = column, Kind = kind };

        public static readonly Dictionary<string, FieldDef[]> Tables = new Dictionary<string, FieldDef[]>
        {
            ["lead"] = new[]
            {
                T("firstName", "vibe_firstname"), T("lastName", "vibe_lastname"), T("company", "vibe_company"), T("jobTitle", "vibe_jobtitle"),
                T("email", "vibe_email"), T("phone", "vibe_phone"), T("website", "vibe_website"),
                C("leadSource", "vibe_leadsource", LeadSources), T("description", "vibe_description"),
                C("status", "vibe_leadstatus", LeadStatuses), C("disqualifyReason", "vibe_disqualifyreason", DisqualifyReasons),
                T("disqualifyComment", "vibe_disqualifycomment"), D("disqualifiedOn", "vibe_disqualifiedon", FieldKind.DateTime),
                L("disqualifiedById", "vibe_disqualifiedby", "systemuser"),
                L("ownerId", "ownerid", "systemuser"), D("createdOn", "createdon", FieldKind.DateTime),
                L("processVersionId", "vibe_processversionid", "vibe_processversion"), T("currentStepId", "vibe_currentstep"),
                D("stepEnteredOn", "vibe_stepenteredon", FieldKind.DateTime),
            },
            ["opportunity"] = new[]
            {
                T("name", "vibe_name"), L("accountId", "vibe_accountid", "account"), L("primaryContactId", "vibe_primarycontactid", "contact"),
                C("stage", "vibe_stage", Stages), D("probability", "vibe_probability", FieldKind.Number),
                C("forecastCategory", "vibe_forecastcategory", ForecastCategories), D("estimatedValue", "vibe_estimatedvalue", FieldKind.Money),
                D("expectedCloseDate", "vibe_expectedclosedate", FieldKind.Date), T("nextStep", "vibe_nextstep"), T("description", "vibe_description"),
                C("leadSource", "vibe_leadsource", LeadSources), L("originatingLeadId", "vibe_originatingleadid", "vibe_lead"),
                D("actualValue", "vibe_actualvalue", FieldKind.Money), D("closeDate", "vibe_closedate", FieldKind.Date),
                C("lostReason", "vibe_lostreason", LostReasons), T("lostComment", "vibe_lostcomment"), L("closedById", "vibe_closedby", "systemuser"),
                L("ownerId", "ownerid", "systemuser"), D("createdOn", "createdon", FieldKind.DateTime),
                L("processVersionId", "vibe_processversionid", "vibe_processversion"), T("currentStepId", "vibe_currentstep"),
                D("stepEnteredOn", "vibe_stepenteredon", FieldKind.DateTime),
            },
            ["account"] = new[]
            {
                T("name", "name"), T("website", "websiteurl"), T("phone", "telephone1"), T("street", "address1_line1"), T("city", "address1_city"),
                T("postcode", "address1_postalcode"), T("country", "address1_country"), T("description", "description"),
                D("accountType", "customertypecode", FieldKind.AccountType), D("industry", "industrycode", FieldKind.Industry),
                L("ownerId", "ownerid", "systemuser"), D("createdOn", "createdon", FieldKind.DateTime),
            },
            ["contact"] = new[]
            {
                T("firstName", "firstname"), T("lastName", "lastname"), T("jobTitle", "jobtitle"), L("accountId", "parentcustomerid", "account"),
                T("email", "emailaddress1"), T("phone", "telephone1"), T("mobile", "mobilephone"),
                L("ownerId", "ownerid", "systemuser"), D("createdOn", "createdon", FieldKind.DateTime),
            },
            // Related lists (read-only data to the engine).
            ["task"] = new[]
            {
                T("subject", "subject"), T("description", "description"), D("dueDate", "scheduledend", FieldKind.Date),
                D("completed", "statecode", FieldKind.StateDone), D("createdOn", "createdon", FieldKind.DateTime), T("actionId", "vibe_actionid"),
            },
            ["phoneCall"] = new[]
            {
                T("subject", "subject"), D("direction", "directioncode", FieldKind.Direction), D("date", "scheduledend", FieldKind.Date),
                T("notes", "description"), D("completed", "statecode", FieldKind.StateDone), D("createdOn", "createdon", FieldKind.DateTime),
            },
            ["note"] = new[] { T("title", "subject"), T("text", "notetext"), D("createdOn", "createdon", FieldKind.DateTime) },
            ["quote"] = new[]
            {
                D("status", "statuscode", FieldKind.QuoteStatus), D("validUntil", "vibe_validuntil", FieldKind.Date),
                D("netTotal", "vibe_nettotal", FieldKind.Money), D("grossTotal", "vibe_grosstotal", FieldKind.Money),
                D("revision", "vibe_revision", FieldKind.Number), D("createdOn", "createdon", FieldKind.DateTime),
            },
        };

        public static readonly Dictionary<string, string> LogicalNames = new Dictionary<string, string>
        {
            ["lead"] = "vibe_lead", ["opportunity"] = "vibe_opportunity", ["account"] = "account", ["contact"] = "contact",
            ["task"] = "task", ["phoneCall"] = "phonecall", ["note"] = "annotation", ["quote"] = "vibe_quote",
        };

        public static string[] Columns(string table)
        {
            return Tables[table].Select(f => f.Column).Distinct().ToArray();
        }

        public static string PrimaryId(string table)
        {
            switch (table)
            {
                case "lead": return "vibe_leadid";
                case "opportunity": return "vibe_opportunityid";
                case "account": return "accountid";
                case "contact": return "contactid";
                case "task": return "activityid";
                case "phoneCall": return "activityid";
                case "quote": return "vibe_quoteid";
                default: return "annotationid";
            }
        }

        /// <summary>The field catalogue the engine checks definitions against: what the adapter can map. Product lines aren't mapped yet, so that table is not checked; Quotes are, by status.</summary>
        public static FieldCatalogue Catalogue()
        {
            var catalogue = new FieldCatalogue();
            foreach (var table in Tables)
            {
                var fields = new Dictionary<string, FieldInfo>();
                foreach (var def in table.Value)
                {
                    FieldInfo info = null;
                    switch (def.Kind)
                    {
                        case FieldKind.Text: info = new FieldInfo { Type = "text" }; break;
                        case FieldKind.Number: case FieldKind.Money: info = new FieldInfo { Type = "number" }; break;
                        case FieldKind.Date: case FieldKind.DateTime: info = new FieldInfo { Type = "date" }; break;
                        case FieldKind.Lookup: info = new FieldInfo { Type = "lookup" }; break;
                        case FieldKind.Bool: case FieldKind.StateDone: info = new FieldInfo { Type = "boolean" }; break;
                        case FieldKind.Choice: info = new FieldInfo { Type = "choice", Options = def.Options.ToList() }; break;
                        case FieldKind.AccountType: info = new FieldInfo { Type = "choice", Options = AccountTypes.ToList() }; break;
                        case FieldKind.Industry: info = new FieldInfo { Type = "choice", Options = Industries.ToList() }; break;
                        case FieldKind.Direction: info = new FieldInfo { Type = "choice", Options = new List<string> { "incoming", "outgoing" } }; break;
                        case FieldKind.QuoteStatus: info = new FieldInfo { Type = "choice", Options = QuoteStatuses.ToList() }; break;
                    }
                    fields[def.Name] = info;
                }
                catalogue[table.Key] = fields;
            }
            return catalogue;
        }

        /// <summary>A Dataverse attribute value as the engine sees it.</summary>
        public static object ToEngine(FieldDef def, object value)
        {
            if (value == null) return null;
            switch (def.Kind)
            {
                case FieldKind.Text: return value as string;
                case FieldKind.Number: return Convert.ToDouble(value, CultureInfo.InvariantCulture);
                case FieldKind.Money: return Convert.ToDouble(((Money)value).Value, CultureInfo.InvariantCulture);
                case FieldKind.Date: return ((DateTime)value).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                case FieldKind.DateTime: return ((DateTime)value).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
                case FieldKind.Choice:
                {
                    var index = ((OptionSetValue)value).Value - ChoiceBase;
                    return index >= 0 && index < def.Options.Length ? def.Options[index] : null;
                }
                case FieldKind.Lookup: return ((EntityReference)value).Id.ToString("D");
                case FieldKind.Bool: return (bool)value;
                case FieldKind.AccountType:
                {
                    var index = Array.IndexOf(AccountTypeCodes, ((OptionSetValue)value).Value);
                    return index < 0 ? null : AccountTypes[index];
                }
                case FieldKind.Industry:
                {
                    var index = ((OptionSetValue)value).Value - 1;
                    return index >= 0 && index < Industries.Length ? Industries[index] : null;
                }
                case FieldKind.StateDone: return ((OptionSetValue)value).Value == 1;
                case FieldKind.Direction: return (bool)value ? "outgoing" : "incoming";
                case FieldKind.QuoteStatus:
                {
                    var index = ((OptionSetValue)value).Value - 1;
                    return index >= 0 && index < QuoteStatuses.Length ? QuoteStatuses[index] : null;
                }
            }
            return null;
        }

        /// <summary>An engine value as a Dataverse attribute value. Returns false when the value can't be stored.</summary>
        public static bool TryToAttribute(FieldDef def, object value, out object attribute)
        {
            attribute = null;
            if (value == null || (value is string && ((string)value).Trim().Length == 0)) return true;
            switch (def.Kind)
            {
                case FieldKind.Text: attribute = Convert.ToString(value, CultureInfo.InvariantCulture); return true;
                case FieldKind.Number: attribute = Convert.ToInt32(Convert.ToDouble(value, CultureInfo.InvariantCulture)); return true;
                case FieldKind.Money: attribute = new Money(Convert.ToDecimal(value, CultureInfo.InvariantCulture)); return true;
                case FieldKind.Date:
                {
                    var text = value as string;
                    DateTime date;
                    if (text == null || !DateTime.TryParseExact(text.Substring(0, Math.Min(10, text.Length)), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date)) return false;
                    attribute = date;
                    return true;
                }
                case FieldKind.DateTime:
                {
                    DateTime moment;
                    if (!DateTime.TryParse(value as string, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out moment)) return false;
                    attribute = DateTime.SpecifyKind(moment, DateTimeKind.Utc);
                    return true;
                }
                case FieldKind.Choice:
                {
                    var index = Array.IndexOf(def.Options, value as string);
                    if (index < 0) return false;
                    attribute = new OptionSetValue(ChoiceBase + index);
                    return true;
                }
                case FieldKind.Lookup:
                {
                    Guid id;
                    if (!Guid.TryParse(value as string, out id)) return false;
                    attribute = new EntityReference(def.LookupTable, id);
                    return true;
                }
                case FieldKind.Bool: attribute = Convert.ToBoolean(value, CultureInfo.InvariantCulture); return true;
                case FieldKind.AccountType:
                {
                    var index = Array.IndexOf(AccountTypes, value as string);
                    if (index < 0) return false;
                    attribute = new OptionSetValue(AccountTypeCodes[index]);
                    return true;
                }
                case FieldKind.Industry:
                {
                    var index = Array.IndexOf(Industries, value as string);
                    if (index < 0) return false;
                    attribute = new OptionSetValue(index + 1);
                    return true;
                }
            }
            return false;
        }

        public static EngineRecord ToRecord(string table, Entity entity)
        {
            var record = new EngineRecord { ["id"] = entity.Id.ToString("D") };
            foreach (var def in Tables[table])
            {
                object value;
                record[def.Name] = entity.Attributes.TryGetValue(def.Column, out value) ? ToEngine(def, value is AliasedValue ? ((AliasedValue)value).Value : value) : null;
            }
            return record;
        }

        /// <summary>Only the attributes the caller wrote (a Target), as the engine's change.</summary>
        public static EngineRecord ToChange(string table, Entity target)
        {
            var change = new EngineRecord();
            foreach (var def in Tables[table])
            {
                object value;
                if (target.Attributes.TryGetValue(def.Column, out value)) change[def.Name] = ToEngine(def, value);
            }
            return change;
        }
    }
}
