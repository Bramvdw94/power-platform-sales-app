using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Post-operation on create, update and delete of vibe_quoteline (issue 101): the Quote's
    /// net total, VAT per rate and gross total are recomputed from its lines in the same
    /// transaction, so imports and the app agree.
    /// </summary>
    public class QuoteTotalPlugin : PluginBase
    {
        private static readonly int[] VatRates = { 21, 9, 0 };

        public QuoteTotalPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(QuoteTotalPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
            {
                throw new ArgumentNullException(nameof(localPluginContext));
            }

            var context = localPluginContext.PluginExecutionContext;
            if (context.ParentContext != null && context.ParentContext.MessageName == "Delete"
                && (context.ParentContext.PrimaryEntityName == "vibe_quote" || context.ParentContext.PrimaryEntityName == "vibe_opportunity"))
            {
                return; // the lines go with their Quote
            }

            if (QuotePlugin.CascadesFromOpportunity(context))
            {
                return; // Reassign moving lines to the new Owner changes no amounts
            }

            var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
            Guid quoteId;
            if (context.MessageName == "Delete")
            {
                if (!context.SharedVariables.Contains(QuoteLinePlugin.QuoteKey))
                {
                    return;
                }

                quoteId = (Guid)context.SharedVariables[QuoteLinePlugin.QuoteKey];
            }
            else
            {
                var line = system.Retrieve("vibe_quoteline", ((Entity)context.InputParameters["Target"]).Id, new ColumnSet("vibe_quoteid"));
                quoteId = line.GetAttributeValue<EntityReference>("vibe_quoteid").Id;
            }

            var query = new QueryExpression("vibe_quoteline") { ColumnSet = new ColumnSet("vibe_lineamount", "vibe_vatrate") };
            query.Criteria.AddCondition("vibe_quoteid", ConditionOperator.Equal, quoteId);
            var lines = system.RetrieveMultiple(query).Entities.Select(l =>
            {
                var index = (l.GetAttributeValue<OptionSetValue>("vibe_vatrate")?.Value ?? 0) - FieldMapChoiceBase;
                return new QuoteLineAmount(l.GetAttributeValue<Money>("vibe_lineamount")?.Value ?? 0m, index >= 0 && index < VatRates.Length ? VatRates[index] : 0);
            });
            var totals = QuoteRules.Totals(lines);

            var update = new Entity("vibe_quote", quoteId);
            update["vibe_nettotal"] = new Money(totals.Net);
            update["vibe_vat21"] = new Money(totals.Vat21);
            update["vibe_vat9"] = new Money(totals.Vat9);
            update["vibe_grosstotal"] = new Money(totals.Gross);
            system.Update(update);
        }

        private const int FieldMapChoiceBase = 841200000;
    }
}
