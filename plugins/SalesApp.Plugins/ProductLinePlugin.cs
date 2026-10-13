using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Pre-operation on create, update and delete of vibe_productline (issue 100). It keeps
    /// the line honest: Line amount, List price at add, Owner, an active Product, an open
    /// Opportunity. ProductLineTotalPlugin then totals the lines into the Estimated value.
    /// </summary>
    public class ProductLinePlugin : PluginBase
    {
        private const string Line = "vibe_productline";
        private const string Opportunity = "vibe_opportunity";
        internal const string OpportunityKey = "vibe_productline_opportunity";

        public ProductLinePlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ProductLinePlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
            {
                throw new ArgumentNullException(nameof(localPluginContext));
            }

            var context = localPluginContext.PluginExecutionContext;
            if (context.ParentContext != null && context.ParentContext.MessageName == "Delete" && context.ParentContext.PrimaryEntityName == Opportunity)
            {
                return; // the lines go with their Opportunity
            }

            var system = localPluginContext.OrgSvcFactory.CreateOrganizationService(null);
            switch (context.MessageName)
            {
                case "Create":
                    Create(localPluginContext, system, (Entity)context.InputParameters["Target"]);
                    break;
                case "Update":
                    Update(system, (Entity)context.InputParameters["Target"]);
                    break;
                case "Delete":
                    Delete(context, system, (EntityReference)context.InputParameters["Target"]);
                    break;
            }
        }

        private static void Create(ILocalPluginContext local, IOrganizationService system, Entity target)
        {
            var opportunityRef = target.GetAttributeValue<EntityReference>("vibe_opportunityid");
            var productRef = target.GetAttributeValue<EntityReference>("vibe_productid");
            if (opportunityRef == null || productRef == null)
            {
                throw new InvalidPluginExecutionException("A Product line needs an Opportunity and a Product.");
            }

            var opportunity = RequireOpen(system, opportunityRef.Id);
            var product = system.Retrieve("vibe_product", productRef.Id, new ColumnSet("vibe_name", "vibe_description", "vibe_listprice", "statecode"));
            if (product.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0)
            {
                throw new InvalidPluginExecutionException("A retired Product cannot be added to a line.");
            }

            var listPrice = product.GetAttributeValue<Money>("vibe_listprice")?.Value ?? 0m;
            var quantity = target.GetAttributeValue<decimal?>("vibe_quantity") ?? 1m;
            var unitPrice = target.GetAttributeValue<Money>("vibe_unitprice")?.Value ?? listPrice;
            var discount = target.GetAttributeValue<decimal?>("vibe_discountpercent") ?? 0m;
            Refuse(local, ProductLineRules.Check(quantity, unitPrice, discount));

            var amount = ProductLineRules.LineAmount(quantity, unitPrice, discount);
            target["vibe_quantity"] = quantity;
            target["vibe_unitprice"] = new Money(unitPrice);
            target["vibe_discountpercent"] = discount;
            target["vibe_listpriceatadd"] = new Money(listPrice);
            target["vibe_lineamount"] = new Money(amount);
            if (!target.Contains("vibe_description"))
            {
                target["vibe_description"] = product.GetAttributeValue<string>("vibe_description");
            }

            if (string.IsNullOrWhiteSpace(target.GetAttributeValue<string>("vibe_name")))
            {
                target["vibe_name"] = product.GetAttributeValue<string>("vibe_name");
            }

            target["ownerid"] = opportunity.GetAttributeValue<EntityReference>("ownerid");
        }

        private static void Update(IOrganizationService system, Entity target)
        {
            var current = system.Retrieve(Line, target.Id,
                new ColumnSet("vibe_opportunityid", "vibe_productid", "vibe_quantity", "vibe_unitprice", "vibe_discountpercent", "vibe_listpriceatadd"));
            var opportunityRef = current.GetAttributeValue<EntityReference>("vibe_opportunityid");
            RequireOpen(system, opportunityRef.Id);

            foreach (var locked in new[] { "vibe_opportunityid", "vibe_productid" })
            {
                if (target.Contains(locked) && target.GetAttributeValue<EntityReference>(locked)?.Id != current.GetAttributeValue<EntityReference>(locked)?.Id)
                {
                    throw new InvalidPluginExecutionException("A Product line stays on its Opportunity and its Product. Remove the line and add another.");
                }
            }

            if (target.Contains("vibe_listpriceatadd") && target.GetAttributeValue<Money>("vibe_listpriceatadd")?.Value != current.GetAttributeValue<Money>("vibe_listpriceatadd")?.Value)
            {
                throw new InvalidPluginExecutionException("The List price at add never changes.");
            }

            var quantity = Pick<decimal?>(target, current, "vibe_quantity") ?? 1m;
            var unitPrice = Pick<Money>(target, current, "vibe_unitprice")?.Value ?? 0m;
            var discount = Pick<decimal?>(target, current, "vibe_discountpercent") ?? 0m;
            var refusal = ProductLineRules.Check(quantity, unitPrice, discount);
            if (refusal != null)
            {
                throw new InvalidPluginExecutionException(refusal);
            }

            var amount = ProductLineRules.LineAmount(quantity, unitPrice, discount);
            target["vibe_lineamount"] = new Money(amount);
        }

        private static void Delete(IPluginExecutionContext context, IOrganizationService system, EntityReference target)
        {
            var line = system.Retrieve(Line, target.Id, new ColumnSet("vibe_opportunityid"));
            var opportunityRef = line.GetAttributeValue<EntityReference>("vibe_opportunityid");
            RequireOpen(system, opportunityRef.Id);
            context.SharedVariables[OpportunityKey] = opportunityRef.Id;
        }

        private static void Refuse(ILocalPluginContext local, string refusal)
        {
            if (refusal != null)
            {
                local.Trace("Refused: " + refusal);
                throw new InvalidPluginExecutionException(refusal);
            }
        }

        private static Entity RequireOpen(IOrganizationService system, Guid opportunityId)
        {
            var opportunity = system.Retrieve(Opportunity, opportunityId, new ColumnSet("statecode", "ownerid"));
            if (opportunity.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0)
            {
                throw new InvalidPluginExecutionException("A closed Opportunity's Product lines are read-only.");
            }

            return opportunity;
        }

        private static T Pick<T>(Entity target, Entity current, string attribute)
        {
            return target.Contains(attribute) ? target.GetAttributeValue<T>(attribute) : current.GetAttributeValue<T>(attribute);
        }
    }
}
