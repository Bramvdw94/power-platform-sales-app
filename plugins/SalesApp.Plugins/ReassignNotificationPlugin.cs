using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using SalesApp.Plugins.Engine;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Tells the new Owner of a Lead, Opportunity, Account or Contact that it was assigned to them (#171).
    /// Registered post-operation on Update of the Owner column. The Notification is created as the system:
    /// salespeople may read and mark their own Notifications read but never create one. A failure here never
    /// undoes the Reassign; the record is already theirs.
    /// </summary>
    public class ReassignNotificationPlugin : PluginBase
    {
        public ReassignNotificationPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ReassignNotificationPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null) throw new ArgumentNullException(nameof(localPluginContext));
            var context = localPluginContext.PluginExecutionContext;
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            var newOwner = target?.GetAttributeValue<EntityReference>("ownerid");
            if (newOwner == null || newOwner.LogicalName != "systemuser") return;
            if (!ReassignNotificationRules.ShouldNotify(newOwner.Id, context.InitiatingUserId)) return;
            var table = FieldMap.LogicalNames.Where(p => new[] { "lead", "opportunity", "account", "contact" }.Contains(p.Key))
                .Where(p => p.Value == target.LogicalName).Select(p => p.Key).FirstOrDefault();
            if (table == null) return;

            try
            {
                var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
                var by = system.Retrieve("systemuser", context.InitiatingUserId, new ColumnSet("fullname")).GetAttributeValue<string>("fullname") ?? "Someone";
                var text = ReassignNotificationRules.Fit(ReassignNotificationRules.Text(by, table, RecordName(system, table, target)));
                var notification = new Entity("vibe_notification")
                {
                    ["vibe_name"] = text,
                    ["vibe_recipientid"] = new EntityReference("systemuser", newOwner.Id),
                    ["ownerid"] = new EntityReference("systemuser", newOwner.Id),
                    ["vibe_kind"] = new OptionSetValue(ReassignNotificationRules.ReassignKind),
                    ["vibe_regardingtable"] = target.LogicalName,
                    ["vibe_regardingid"] = target.Id.ToString("D"),
                    ["vibe_isread"] = false,
                };
                system.Create(notification);
            }
            catch (Exception ex)
            {
                localPluginContext.Trace("Reassign Notification not posted: " + ex);
            }
        }

        static string RecordName(IOrganizationService system, string table, Entity target)
        {
            var columns = table == "lead" ? new[] { "vibe_firstname", "vibe_lastname" }
                : table == "contact" ? new[] { "firstname", "lastname" }
                : table == "opportunity" ? new[] { "vibe_name" }
                : new[] { "name" };
            var row = system.Retrieve(target.LogicalName, target.Id, new ColumnSet(columns));
            return string.Join(" ", columns.Select(c => row.GetAttributeValue<string>(c)).Where(v => !string.IsNullOrWhiteSpace(v))).Trim();
        }
    }
}
