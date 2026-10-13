using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Pre-operation on update of vibe_opportunity, filtered on vibe_estimatedvalue (issue 100).
    /// While an Opportunity has Product lines its Estimated value is their total, so any other
    /// value is refused. The write ProductLineTotalPlugin makes is the total, so it passes.
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

            var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
            var total = ProductLineTotal.Of(system, target.Id);
            if (!total.HasValue || target.GetAttributeValue<Money>("vibe_estimatedvalue")?.Value == total.Value)
            {
                return;
            }

            localPluginContext.Trace($"Refused a direct write to the Estimated value of {target.Id} by {context.InitiatingUserId}");
            throw new InvalidPluginExecutionException("The Estimated value is the total of this Opportunity's Product lines. Change the lines instead.");
        }
    }
}
