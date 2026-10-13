using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesApp.Plugins
{
    /// <summary>
    /// Pre-operation on create, update and delete of vibe_quote (issue 101). A Quote gets its
    /// Opportunity's Owner and can only be made on an open Opportunity. Only a Draft can be
    /// changed or deleted; its status moves Draft to Sent, then Sent to Accepted, Rejected or
    /// Revised. Everything but Draft is deactivated, so it stays as it was sent.
    /// </summary>
    public class QuotePlugin : PluginBase
    {
        private const string Quote = "vibe_quote";
        private const string Opportunity = "vibe_opportunity";

        // Columns only the totals plug-in (a nested call) and the plug-in itself write.
        private static readonly string[] Computed = { "vibe_nettotal", "vibe_vat21", "vibe_vat9", "vibe_grosstotal" };
        private static readonly string[] Locked = { "vibe_opportunityid", "vibe_accountid", "vibe_revision", "ownerid" };

        public QuotePlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(QuotePlugin))
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
                return; // the Quotes go with their Opportunity
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
            var opportunityRef = target.GetAttributeValue<EntityReference>("vibe_opportunityid");
            if (opportunityRef == null)
            {
                throw Refuse(local, "A Quote needs an Opportunity.");
            }

            var opportunity = system.Retrieve(Opportunity, opportunityRef.Id, new ColumnSet("statecode", "ownerid"));
            if (opportunity.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0)
            {
                throw Refuse(local, "A closed Opportunity can't get new Quotes.");
            }

            var status = target.GetAttributeValue<OptionSetValue>("statuscode")?.Value;
            if (status.HasValue && status.Value != QuoteRules.Draft)
            {
                throw Refuse(local, "A new Quote starts as a Draft.");
            }

            if (!target.Contains("vibe_revision"))
            {
                target["vibe_revision"] = 0;
            }

            target["ownerid"] = opportunity.GetAttributeValue<EntityReference>("ownerid");
        }

        private static void Update(ILocalPluginContext local, IOrganizationService system, Entity target)
        {
            var context = local.PluginExecutionContext;
            var current = system.Retrieve(Quote, target.Id,
                new ColumnSet("statecode", "statuscode", "vibe_opportunityid", "vibe_accountid", "vibe_revision", "ownerid"));
            var from = current.GetAttributeValue<OptionSetValue>("statuscode")?.Value ?? QuoteRules.Draft;
            var nested = context.Depth > 1;

            // Reassigning the Opportunity cascades its new Owner to its Quotes, whatever their status.
            if (target.Contains("ownerid") && (target.GetAttributeValue<OptionSetValue>("statuscode") == null || target.GetAttributeValue<OptionSetValue>("statuscode").Value == from) && !target.Attributes.Keys.Any(k => k.StartsWith("vibe_") && k != "vibe_quoteid"))
            {
                if (CascadesFromOpportunity(context))
                {
                    return; // a cascade from the Opportunity's Reassign, not a user's write
                }

                var opportunityOwner = system.Retrieve(Opportunity, current.GetAttributeValue<EntityReference>("vibe_opportunityid").Id, new ColumnSet("ownerid"));
                if (SameValue(target["ownerid"], opportunityOwner.Contains("ownerid") ? opportunityOwner["ownerid"] : null))
                {
                    return;
                }

                throw Refuse(local, "A Quote follows its Opportunity's Owner. Reassign the Opportunity instead.");
            }

            foreach (var column in Computed)
            {
                if (target.Contains(column) && !nested)
                {
                    throw Refuse(local, "A Quote's totals are kept from its lines.");
                }
            }

            foreach (var column in Locked)
            {
                if (target.Contains(column) && !SameValue(target[column], current.Contains(column) ? current[column] : null) && !nested)
                {
                    throw Refuse(local, column == "ownerid"
                        ? "A Quote follows its Opportunity's Owner. Reassign the Opportunity instead."
                        : "A Quote stays on its Opportunity, Account and Revision.");
                }
            }

            var to = target.GetAttributeValue<OptionSetValue>("statuscode")?.Value;
            if (to.HasValue && to.Value != from)
            {
                if (!QuoteRules.CanMove(from, to.Value))
                {
                    throw Refuse(local, "A Quote can't go from " + Name(from) + " to " + Name(to.Value) + ".");
                }

                var state = target.GetAttributeValue<OptionSetValue>("statecode")?.Value;
                if (state.HasValue && state.Value != (to.Value == QuoteRules.Draft ? 0 : 1))
                {
                    throw Refuse(local, "A Quote that is not a Draft is inactive.");
                }

                if (from != QuoteRules.Draft && target.Attributes.Keys.Any(IsBusiness))
                {
                    throw Refuse(local, "Only a Draft Quote can be changed.");
                }

                if (from == QuoteRules.Draft)
                {
                    var opportunityRef = current.GetAttributeValue<EntityReference>("vibe_opportunityid");
                    var opportunity = system.Retrieve(Opportunity, opportunityRef.Id, new ColumnSet("statecode"));
                    if (opportunity.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0)
                    {
                        throw Refuse(local, "A closed Opportunity's Quotes are read-only.");
                    }
                }

                return;
            }

            if (from != QuoteRules.Draft)
            {
                throw Refuse(local, "Only a Draft Quote can be changed.");
            }

        }

        private static void Delete(ILocalPluginContext local, IOrganizationService system, EntityReference target)
        {
            var current = system.Retrieve(Quote, target.Id, new ColumnSet("statuscode"));
            if ((current.GetAttributeValue<OptionSetValue>("statuscode")?.Value ?? QuoteRules.Draft) != QuoteRules.Draft)
            {
                throw Refuse(local, "Only a Draft Quote can be deleted.");
            }
        }

        /// <summary>True when this write is nested inside a change to an Opportunity, as Reassign's cascade is. Any owner change nests in an Assign of the record itself, so a parent alone proves nothing.</summary>
        internal static bool CascadesFromOpportunity(IPluginExecutionContext context)
        {
            for (var parent = context.ParentContext; parent != null; parent = parent.ParentContext)
            {
                if (parent.PrimaryEntityName == Opportunity)
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>A column of the Quote's own, as against the ones the platform puts on every update.</summary>
        private static bool IsBusiness(string column)
        {
            return (column.StartsWith("vibe_") && column != "vibe_quoteid") || column == "ownerid";
        }

        private static bool SameValue(object a, object b)
        {
            var left = a as EntityReference;
            var right = b as EntityReference;
            if (left != null || right != null)
            {
                return left != null && right != null && left.Id == right.Id;
            }

            return Equals(a, b);
        }

        private static string Name(int status)
        {
            switch (status)
            {
                case QuoteRules.Draft: return "Draft";
                case QuoteRules.Sent: return "Sent";
                case QuoteRules.Accepted: return "Accepted";
                case QuoteRules.Rejected: return "Rejected";
                case QuoteRules.Revised: return "Revised";
                default: return "that status";
            }
        }

        private static InvalidPluginExecutionException Refuse(ILocalPluginContext local, string message)
        {
            local.Trace("Refused: " + message);
            return new InvalidPluginExecutionException(message);
        }
    }
}
