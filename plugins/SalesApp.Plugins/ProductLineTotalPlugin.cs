using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Post-operation on create, update and delete of vibe_productline (issue 100): the
    /// Opportunity's Estimated value becomes the sum of its lines' amounts, in the same
    /// transaction, so imports and the app agree. When the last line goes, the Estimated
    /// value keeps its last total and is manual again.
    /// </summary>
    public class ProductLineTotalPlugin : PluginBase
    {
        public ProductLineTotalPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ProductLineTotalPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
            {
                throw new ArgumentNullException(nameof(localPluginContext));
            }

            var context = localPluginContext.PluginExecutionContext;
            if (context.ParentContext != null && context.ParentContext.MessageName == "Delete" && context.ParentContext.PrimaryEntityName == "vibe_opportunity")
            {
                return; // the lines go with their Opportunity
            }

            var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
            Guid opportunityId;
            if (context.MessageName == "Delete")
            {
                if (!context.SharedVariables.Contains(ProductLinePlugin.OpportunityKey))
                {
                    return;
                }

                opportunityId = (Guid)context.SharedVariables[ProductLinePlugin.OpportunityKey];
            }
            else
            {
                var line = system.Retrieve("vibe_productline", ((Entity)context.InputParameters["Target"]).Id, new ColumnSet("vibe_opportunityid"));
                opportunityId = line.GetAttributeValue<EntityReference>("vibe_opportunityid").Id;
            }

            var total = ProductLineTotal.Of(system, opportunityId);
            if (!total.HasValue)
            {
                return; // the last line is gone: the Estimated value stays and is manual again
            }

            var current = system.Retrieve("vibe_opportunity", opportunityId, new ColumnSet("vibe_estimatedvalue"));
            if (current.GetAttributeValue<Money>("vibe_estimatedvalue")?.Value == total.Value)
            {
                return;
            }

            var update = new Entity("vibe_opportunity", opportunityId);
            update["vibe_estimatedvalue"] = new Money(total.Value);
            system.Update(update);
        }
    }

    internal static class ProductLineTotal
    {
        /// <returns>The sum of the Opportunity's line amounts as stored, or null when it has no lines.</returns>
        internal static decimal? Of(IOrganizationService system, Guid opportunityId)
        {
            var query = new QueryExpression("vibe_productline") { ColumnSet = new ColumnSet("vibe_lineamount") };
            query.Criteria.AddCondition("vibe_opportunityid", ConditionOperator.Equal, opportunityId);
            var lines = system.RetrieveMultiple(query).Entities;
            return lines.Count == 0 ? (decimal?)null : lines.Sum(l => l.GetAttributeValue<Money>("vibe_lineamount")?.Value ?? 0m);
        }
    }
}
