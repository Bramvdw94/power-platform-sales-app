using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Pre-operation guard on create and update of vibe_quota (issue 104). The role
    /// privileges let a manager write rows, but they cannot say whose: this refuses a
    /// salesperson setting their own Quota and a manager setting anyone's but a direct
    /// report's. It also owns each row by its salesperson, so the manager hierarchy gives
    /// the manager access to it and nobody else can read it.
    /// </summary>
    public class QuotaGuardPlugin : PluginBase
    {
        private const string Table = "vibe_quota";
        private const string SystemAdministrator = "System Administrator";

        public QuotaGuardPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(QuotaGuardPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
            {
                throw new ArgumentNullException(nameof(localPluginContext));
            }

            var context = localPluginContext.PluginExecutionContext;
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            if (target == null || target.LogicalName != Table)
            {
                return;
            }

            var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
            var isCreate = context.MessageName == "Create";

            Entity current = null;
            if (!isCreate)
            {
                current = system.Retrieve(Table, target.Id, new ColumnSet("vibe_salespersonid", "vibe_month", "vibe_amount", "vibe_name", "ownerid"));
            }

            var salesperson = Pick<EntityReference>(target, current, "vibe_salespersonid");
            var month = Pick<DateTime?>(target, current, "vibe_month");
            var amount = Pick<Money>(target, current, "vibe_amount");
            if (salesperson == null || month == null || amount == null)
            {
                throw new InvalidPluginExecutionException("A Quota needs a Salesperson, a Month and an Amount.");
            }

            if (!isCreate)
            {
                var was = current.GetAttributeValue<EntityReference>("vibe_salespersonid");
                var wasMonth = current.GetAttributeValue<DateTime?>("vibe_month");
                if (was.Id != salesperson.Id || wasMonth != month)
                {
                    throw new InvalidPluginExecutionException("A Quota row belongs to one salesperson and one month. Change the Amount, or add another row.");
                }

                var owner = target.GetAttributeValue<EntityReference>("ownerid");
                if (owner != null && owner.Id != salesperson.Id)
                {
                    throw new InvalidPluginExecutionException("A Quota is owned by its salesperson.");
                }
            }

            var user = system.Retrieve("systemuser", salesperson.Id, new ColumnSet("fullname", "parentsystemuserid"));
            var manager = user.GetAttributeValue<EntityReference>("parentsystemuserid");
            var caller = context.InitiatingUserId;
            var admin = caller != salesperson.Id && IsSystemAdministrator(system, caller);

            var refusal = QuotaRules.Check(caller, salesperson.Id, manager?.Id, admin, month.Value, amount.Value);
            if (refusal != null)
            {
                localPluginContext.Trace($"Refused {context.MessageName} by {caller} for {salesperson.Id}: {refusal}");
                throw new InvalidPluginExecutionException(refusal);
            }

            if (isCreate)
            {
                target["ownerid"] = new EntityReference("systemuser", salesperson.Id);
                if (string.IsNullOrWhiteSpace(target.GetAttributeValue<string>("vibe_name")))
                {
                    target["vibe_name"] = $"{user.GetAttributeValue<string>("fullname")} {month.Value:yyyy-MM}";
                }
            }
        }

        private static T Pick<T>(Entity target, Entity current, string attribute)
        {
            if (target.Contains(attribute))
            {
                return target.GetAttributeValue<T>(attribute);
            }

            return current == null ? default(T) : current.GetAttributeValue<T>(attribute);
        }

        private static bool IsSystemAdministrator(IOrganizationService system, Guid userId)
        {
            var query = new QueryExpression("systemuserroles") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            query.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            var role = query.AddLink("role", "roleid", "roleid");
            role.LinkCriteria.AddCondition("name", ConditionOperator.Equal, SystemAdministrator);
            return system.RetrieveMultiple(query).Entities.Count > 0;
        }
    }
}
