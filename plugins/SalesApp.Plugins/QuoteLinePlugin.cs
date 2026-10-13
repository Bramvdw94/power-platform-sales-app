using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Pre-operation on create, update and delete of vibe_quoteline (issue 101). Lines change
    /// only while their Quote is a Draft. A line keeps the Product's description, price and VAT
    /// rate unless the caller sends its own, its Line amount is quantity x price less discount,
    /// and its Owner is the Quote's. QuoteTotalPlugin then totals the lines into the Quote.
    /// </summary>
    public class QuoteLinePlugin : PluginBase
    {
        private const string Line = "vibe_quoteline";
        private const string Quote = "vibe_quote";
        internal const string QuoteKey = "vibe_quoteline_quote";

        public QuoteLinePlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(QuoteLinePlugin))
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
                && (context.ParentContext.PrimaryEntityName == Quote || context.ParentContext.PrimaryEntityName == "vibe_opportunity"))
            {
                return; // the lines go with their Quote
            }

            var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
            switch (context.MessageName)
            {
                case "Create":
                    Create(localPluginContext, system, (Entity)context.InputParameters["Target"]);
                    break;
                case "Update":
                    Update(localPluginContext, system, (Entity)context.InputParameters["Target"]);
                    break;
                case "Delete":
                    Delete(localPluginContext, system, (EntityReference)context.InputParameters["Target"]);
                    break;
            }
        }

        private static void Create(ILocalPluginContext local, IOrganizationService system, Entity target)
        {
            var quoteRef = target.GetAttributeValue<EntityReference>("vibe_quoteid");
            var productRef = target.GetAttributeValue<EntityReference>("vibe_productid");
            if (quoteRef == null || productRef == null)
            {
                throw Refuse(local, "A Quote line needs a Quote and a Product.");
            }

            var quote = RequireDraft(local, system, quoteRef.Id);
            var product = system.Retrieve("vibe_product", productRef.Id, new ColumnSet("vibe_name", "vibe_description", "vibe_listprice", "vibe_vatrate"));
            var quantity = target.GetAttributeValue<decimal?>("vibe_quantity") ?? 1m;
            var unitPrice = target.GetAttributeValue<Money>("vibe_unitprice")?.Value ?? product.GetAttributeValue<Money>("vibe_listprice")?.Value ?? 0m;
            var discount = target.GetAttributeValue<decimal?>("vibe_discountpercent") ?? 0m;
            var refusal = ProductLineRules.Check(quantity, unitPrice, discount);
            if (refusal != null)
            {
                throw Refuse(local, refusal.Replace("Product line", "Quote line"));
            }

            target["vibe_quantity"] = quantity;
            target["vibe_unitprice"] = new Money(unitPrice);
            target["vibe_discountpercent"] = discount;
            target["vibe_lineamount"] = new Money(ProductLineRules.LineAmount(quantity, unitPrice, discount));
            if (!target.Contains("vibe_vatrate"))
            {
                target["vibe_vatrate"] = product.GetAttributeValue<OptionSetValue>("vibe_vatrate");
            }

            if (!target.Contains("vibe_description"))
            {
                target["vibe_description"] = product.GetAttributeValue<string>("vibe_description");
            }

            if (string.IsNullOrWhiteSpace(target.GetAttributeValue<string>("vibe_name")))
            {
                target["vibe_name"] = product.GetAttributeValue<string>("vibe_name");
            }

            target["ownerid"] = quote.GetAttributeValue<EntityReference>("ownerid");
        }

        private static void Update(ILocalPluginContext local, IOrganizationService system, Entity target)
        {
            var current = system.Retrieve(Line, target.Id, new ColumnSet("vibe_quoteid", "vibe_productid", "vibe_quantity", "vibe_unitprice", "vibe_discountpercent"));
            var quoteId = current.GetAttributeValue<EntityReference>("vibe_quoteid").Id;

            // Reassigning the Opportunity cascades the new Owner through its Quotes to their lines, whatever the status.
            if (target.Contains("ownerid") && !target.Attributes.Keys.Any(k => k.StartsWith("vibe_") && k != "vibe_quotelineid"))
            {
                if (QuotePlugin.CascadesFromOpportunity(local.PluginExecutionContext))
                {
                    return;
                }

                var quote = system.Retrieve(Quote, quoteId, new ColumnSet("ownerid"));
                if (target.GetAttributeValue<EntityReference>("ownerid")?.Id == quote.GetAttributeValue<EntityReference>("ownerid")?.Id)
                {
                    return;
                }

                throw Refuse(local, "A Quote line follows its Quote's Owner. Reassign the Opportunity instead.");
            }

            RequireDraft(local, system, quoteId);

            foreach (var locked in new[] { "vibe_quoteid", "vibe_productid" })
            {
                if (target.Contains(locked) && target.GetAttributeValue<EntityReference>(locked)?.Id != current.GetAttributeValue<EntityReference>(locked)?.Id)
                {
                    throw Refuse(local, "A Quote line stays on its Quote and its Product. Remove the line and add another.");
                }
            }

            var quantity = Pick<decimal?>(target, current, "vibe_quantity") ?? 1m;
            var unitPrice = Pick<Money>(target, current, "vibe_unitprice")?.Value ?? 0m;
            var discount = Pick<decimal?>(target, current, "vibe_discountpercent") ?? 0m;
            var refusal = ProductLineRules.Check(quantity, unitPrice, discount);
            if (refusal != null)
            {
                throw Refuse(local, refusal.Replace("Product line", "Quote line"));
            }

            target["vibe_lineamount"] = new Money(ProductLineRules.LineAmount(quantity, unitPrice, discount));
        }

        private static void Delete(ILocalPluginContext local, IOrganizationService system, EntityReference target)
        {
            var line = system.Retrieve(Line, target.Id, new ColumnSet("vibe_quoteid"));
            var quoteRef = line.GetAttributeValue<EntityReference>("vibe_quoteid");
            RequireDraft(local, system, quoteRef.Id);
            local.PluginExecutionContext.SharedVariables[QuoteKey] = quoteRef.Id;
        }

        private static Entity RequireDraft(ILocalPluginContext local, IOrganizationService system, Guid quoteId)
        {
            var quote = system.Retrieve(Quote, quoteId, new ColumnSet("statuscode", "ownerid"));
            if ((quote.GetAttributeValue<OptionSetValue>("statuscode")?.Value ?? QuoteRules.Draft) != QuoteRules.Draft)
            {
                throw Refuse(local, "Only a Draft Quote's lines can be changed.");
            }

            return quote;
        }

        private static T Pick<T>(Entity target, Entity current, string attribute)
        {
            return target.Contains(attribute) ? target.GetAttributeValue<T>(attribute) : current.GetAttributeValue<T>(attribute);
        }

        private static InvalidPluginExecutionException Refuse(ILocalPluginContext local, string message)
        {
            local.Trace("Refused: " + message);
            return new InvalidPluginExecutionException(message);
        }
    }
}
