using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Pre-operation on create, update and delete of vibe_productline (issue 100). It keeps
    /// the line honest (Line amount, List price at add, Owner, an active Product, an open
    /// Opportunity) and keeps the Opportunity's Estimated value equal to the sum of its
    /// lines' amounts, in the same transaction, so imports and the app agree.
    /// When the last line goes, the Estimated value keeps its last total and is manual again.
    /// </summary>
    public class ProductLinePlugin : PluginBase
    {
        private const string Line = "vibe_productline";
        private const string Opportunity = "vibe_opportunity";

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
                    Delete(system, (EntityReference)context.InputParameters["Target"]);
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
            SetEstimatedValue(system, opportunityRef.Id, null, amount);
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
            SetEstimatedValue(system, opportunityRef.Id, target.Id, amount);
        }

        private static void Delete(IOrganizationService system, EntityReference target)
        {
            var line = system.Retrieve(Line, target.Id, new ColumnSet("vibe_opportunityid"));
            var opportunityRef = line.GetAttributeValue<EntityReference>("vibe_opportunityid");
            RequireOpen(system, opportunityRef.Id);
            SetEstimatedValue(system, opportunityRef.Id, target.Id, null);
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

        /// <summary>
        /// Sets the Opportunity's Estimated value to this line's amount plus every other line's.
        /// <paramref name="thisLine"/> is the line being changed or removed (excluded from the sum);
        /// <paramref name="thisAmount"/> is its new amount, or null when it is being removed.
        /// </summary>
        private static void SetEstimatedValue(IOrganizationService system, Guid opportunityId, Guid? thisLine, decimal? thisAmount)
        {
            var query = new QueryExpression(Line) { ColumnSet = new ColumnSet("vibe_lineamount") };
            query.Criteria.AddCondition("vibe_opportunityid", ConditionOperator.Equal, opportunityId);
            if (thisLine.HasValue)
            {
                query.Criteria.AddCondition("vibe_productlineid", ConditionOperator.NotEqual, thisLine.Value);
            }

            var others = system.RetrieveMultiple(query).Entities;
            if (others.Count == 0 && !thisAmount.HasValue)
            {
                return; // the last line is gone: the Estimated value stays and is manual again
            }

            var total = others.Sum(l => l.GetAttributeValue<Money>("vibe_lineamount")?.Value ?? 0m) + (thisAmount ?? 0m);
            var current = system.Retrieve(Opportunity, opportunityId, new ColumnSet("vibe_estimatedvalue"));
            if (current.GetAttributeValue<Money>("vibe_estimatedvalue")?.Value == total)
            {
                return;
            }

            var update = new Entity(Opportunity, opportunityId);
            update["vibe_estimatedvalue"] = new Money(total);
            system.Update(update);
        }

        private static T Pick<T>(Entity target, Entity current, string attribute)
        {
            return target.Contains(attribute) ? target.GetAttributeValue<T>(attribute) : current.GetAttributeValue<T>(attribute);
        }
    }
}
