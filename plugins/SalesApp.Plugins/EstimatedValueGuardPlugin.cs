using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Pre-operation on update of vibe_opportunity, filtered on vibe_estimatedvalue (issue 100).
    /// While an Opportunity has Product lines its Estimated value is their total, so a direct
    /// change is refused. The write ProductLinePlugin makes itself is let through.
    /// </summary>
    public class EstimatedValueGuardPlugin : PluginBase
    {
        public EstimatedValueGuardPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(EstimatedValueGuardPlugin))
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
            if (target == null || target.LogicalName != "vibe_opportunity" || !target.Contains("vibe_estimatedvalue"))
            {
                return;
            }

            // The nested call's own parent is a copy of this update; the line's step sits above it.
            for (var parent = context.ParentContext; parent != null; parent = parent.ParentContext)
            {
                if (parent.PrimaryEntityName == "vibe_productline")
                {
                    return;
                }
            }

            var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
            var lines = new QueryExpression("vibe_productline") { ColumnSet = new ColumnSet(false), TopCount = 1 };
            lines.Criteria.AddCondition("vibe_opportunityid", ConditionOperator.Equal, target.Id);
            if (system.RetrieveMultiple(lines).Entities.Count == 0)
            {
                return;
            }

            var current = system.Retrieve("vibe_opportunity", target.Id, new ColumnSet("vibe_estimatedvalue"));
            if (current.GetAttributeValue<Money>("vibe_estimatedvalue")?.Value == target.GetAttributeValue<Money>("vibe_estimatedvalue")?.Value)
            {
                return;
            }

            localPluginContext.Trace($"Refused a direct write to the Estimated value of {target.Id} by {context.InitiatingUserId}");
            throw new InvalidPluginExecutionException("The Estimated value is the total of this Opportunity's Product lines. Change the lines instead.");
        }
    }
}
