# Approvals, Quote discounts and Orders (research for issue #138)

Researched 2026-10-13. Sources: Salesforce Help and Trailhead, HubSpot Knowledge Base and developer docs, Microsoft Learn (cited inline), and this repo (`GLOSSARY.md`, `docs/adr/0001`, `plugins/SalesApp.Plugins`, `src/sales`). Salesforce's developer object reference only renders with JavaScript and couldn't be fetched, so Salesforce field facts come from Salesforce Help. I didn't query `dev-salesapp` live.

## Answer

- **Approvals.** Salesforce and HubSpot both have a built-in approval engine. A rule decides when a record needs approval, a chain of approvers (often the submitter's manager first, then someone higher) decides, and the record is **locked while the approval is pending**. Dynamics 365 Sales has **no built-in quote or discount approval**. Customers use Power Automate approvals, Microsoft's Business Approvals Kit or third-party add-ons.
- **Discounts.** All three put a **discount on each line** and work out a total discount for the whole Quote. Dynamics and HubSpot also let you enter a discount on the whole Quote. In every case **discounts come before tax**. None of them really works out VAT: Salesforce and Dynamics expect you to type in the tax amount, and HubSpot applies one tax line after discounts and fees. Our app already does better than that, with VAT per rate on the discounted net total.
- **Discount thresholds** are just approval rules on a discount field: "a Quote whose discount is above X % needs approval", with a higher threshold sending it on to a second approver. HubSpot has exactly that ([HubSpot quote approvals](https://knowledge.hubspot.com/quotes/set-up-quote-approvals)), and so does the standard Salesforce example (an Opportunity discounted more than 40 %) ([Trailhead: approvals](https://trailhead.salesforce.com/content/learn/modules/business_process_automation/approvals)).
- **Orders.** Dynamics and Salesforce both make an Order **from an accepted Quote by copying its lines**. Once the Order is past its first status, prices and lines are fixed. Dynamics uses Active, Submitted, Fulfilled, Invoiced and Canceled. Salesforce uses Draft and Activated plus your own labels. HubSpot orders are a loose object with a pipeline you configure, mostly filled by e-commerce integrations.
- **What Power Platform gives us without Azure.** The Power Automate **Approvals connector is a standard connector**, and approvals are stored in Dataverse. It sends Teams cards and Outlook actionable emails, and supports "first to respond", "everyone" and sequential chains ([Get started with approvals](https://learn.microsoft.com/en-us/power-automate/get-started-approvals)). A flow that is triggered from Dataverse and tied to our app counts as "in app context", so it runs on the Power Apps Premium licences the team already has ([Power Automate licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs)). None of this needs Azure or credits. Dataverse has no approval feature of its own that we could drive from the code app.

**Recommendation**

1. **Keep approvals as our own data, enforced by a plug-in**, in the same spirit as ADR 0001. Add an Approval table: one row per request, with the record it's about, the requester, the approver, the step in the chain, the status (Pending, Approved, Rejected, Recalled), the reason and a comment. The approver comes from the Owner's manager (`parentsystemuserid`), the same depth-1 hierarchy the app already uses. A second step goes to the manager's manager when the discount is above the higher threshold.
2. **Discount thresholds as data**, in Quote settings, for example "up to 10 %: no approval; up to 25 %: manager; above that: manager, then their manager". **Measure the discount against the List price, not only the discount percentages.** Owners can lower the unit price instead of typing a discount, which would get round any threshold on the discount percentage alone. Effective discount = 1 − net total ÷ Σ(quantity × List price at the time the line was added).
3. **Enforce in the existing Quote plug-in** (`QuotePlugin` / `QuoteRules`, with the same rules in `src/sales/quotes.ts`). A Draft that needs approval can't be Sent until it has an approval. While a request is Pending, the Draft is locked. Changing an approved Draft so that it needs approval again throws the approval away. The generic process engine doesn't need changing. Its existing "enough related records" Gate can already require an approved Approval on an Opportunity Step if a Process builder wants that later.
4. **Approve in the app first.** A "Waiting for my approval" list and Approve/Reject buttons on the Quote. The plug-in checks that the caller is the assigned approver. Teams or Outlook buttons through a Power Automate approval flow are an optional extra later (see section 5 for the identity catch).
5. **Discounts.** Keep the discount percentage on each Quote line. Optionally add **one Quote discount percentage**, applied to the net total before VAT and **spread over the VAT rates in proportion**, so that VAT per rate stays correct. Leave out amount discounts and volume or discount lists.
6. **Orders, kept small (if v3 needs them at all).** Add **Create Order** on an Accepted Quote. It copies the Quote's lines, totals, VAT per rate, Account, Contact and Opportunity into an Order with its own number. Nothing on the Order can be edited except its status: Open, Fulfilled or Cancelled (optionally Invoiced as well). Allow one Order per Quote.

## 1. Generic approvals in the three CRMs

| | Salesforce | Dynamics 365 Sales | HubSpot |
|---|---|---|---|
| Built-in engine | Yes. Classic Approval Processes, and since Spring '25 **Flow approval orchestrations** | **No.** Power Automate approvals, the Business Approvals Kit or AppSource add-ons | Yes, **quote approvals** only (Revenue Hub Professional/Enterprise; advanced approvals need Enterprise) |
| Who approves | Users, queues or groups per step; the standard example is the submitter's manager, then the CEO | Whatever the flow assigns | Up to 10 approvers ("all required" or "at least one"); advanced: up to 5 sequences of 10, sequential or parallel |
| Chains | Steps in order; stages run in sequence or in parallel | Sequential approval type in Power Automate | Sequences in priority order; each must finish before the next |
| Locks the record? | **Yes**: the default submission action locks it; only approvers and admins can edit | Nothing out of the box | Not documented on the setup page |
| Outcome actions | Field updates, emails, tasks, flows on approve, reject and recall | Flow steps | The quote can be published or sent |

Details:

- **Salesforce classic:** an approval process has steps, an approver for each step, and actions on initial submission, final approval and final rejection. The default submission action **locks the record** so only approvers and admins can edit it. Final approval typically sets the status to Approved and unlocks the record ([Trailhead: approvals](https://trailhead.salesforce.com/content/learn/modules/business_process_automation/approvals)).
- **Salesforce Flow approvals** (Spring '25 onwards): orchestrations of stages and steps. Approval steps can lock the record and allow edits. Approvers are a User, a Queue or a Group. There is a recall path (Summer '25), and an Approvals app with lists of submissions and work items. Manually picking the next approver isn't supported ([Salesforce Ben, Spring '25 flow approvals](https://www.salesforceben.com/salesforce-spring-25-release-new-flow-approval-process-capabilities/), a secondary source because Salesforce Help pages for this didn't render).
- **HubSpot:** standard approval conditions are filters such as "quote discount above X", "a line item discount above X" or "e-signature used". Advanced conditions can use quote amount, SKU, billing frequency, user attributes or deal properties. If the quote's creator is the only approver, no approval is needed. If there are several approvers, the creator is left out ([HubSpot quote approvals](https://knowledge.hubspot.com/quotes/set-up-quote-approvals)).
- **Dynamics 365:** Microsoft's answer is the Power Automate approvals connector and the **Business Approvals Kit**. The kit is a managed solution with 19 flows plus the Creator Kit, and needs a custom connector with an **Entra app registration**. Its licensing points to Power Apps or Power Automate Process licences ([Business Approvals Kit setup](https://learn.microsoft.com/en-us/power-automate/guidance/business-approvals-templates/setup)). The market for discount approval add-ons on AppSource (for example Prodware Discount Management) shows Dynamics doesn't do this itself.

**What locks.** A pending approval freezes whatever the approval is about. For a Quote that means its lines, prices and discounts. Approval normally unlocks the record or moves it on. Rejection returns it to the Owner to change.

## 2. Discounts on Quote lines and on the whole Quote

| | Line discount | Quote discount | Order of calculation | Tax |
|---|---|---|---|---|
| Salesforce (standard Quotes) | **Percentage** per line | Read-only **weighted average** of the line discounts | Subtotal (before discount) → Total price (after discount) → + Tax + Shipping = Grand total | **Typed in** by hand |
| Dynamics 365 | **Amount** per line (manual) plus a volume discount from discount lists; the line amount or per-unit method is an organisation setting | **Percentage and/or amount** on the header, applied to the detail amount | Lines → line discounts → header discount → freight → tax | **Typed in** per line, header = sum |
| HubSpot | **Percentage or amount** per unit | One-time discount (percentage) and fees, associated with the quote | Discounts → fees → taxes | One tax line, percentage or amount, after discounts |

Sources: [Salesforce quote fields](https://help.salesforce.com/s/articleView?id=sf.quotes_fields.htm&language=en_US&type=5), [Salesforce discounts with quotes](https://help.salesforce.com/s/articleView?id=000175498&language=en_US&type=1), [salesorder table](https://learn.microsoft.com/en-us/dynamics365/developer/reference/entities/salesorder), [Create or edit orders](https://learn.microsoft.com/en-us/dynamics365/sales/create-edit-order-sales), [HubSpot line items editor](https://knowledge.hubspot.com/products/edit-products-and-terms-in-the-line-items-editor), [HubSpot discounts API](https://developers.hubspot.com/docs/api-reference/2026-03/crm/objects/discounts/guide.md). The Dynamics quote columns and discount methods are in [products-quotes.md](../v2/products-quotes.md), section 2.

**What we have today.** A Quote line has a quantity, a unit price, a discount percentage and the Product's VAT rate. Line amount = quantity × unit price × (1 − discount %), rounded to cents (`src/sales/product-lines.ts`). `QuoteRules.cs` adds up the net total, works out VAT per rate on the net total of the lines at that rate, and adds the two for the gross total. There is no Quote-level discount.

**If we add a Quote discount percentage:**

- net before Quote discount = Σ line amounts
- Quote discount amount = that net × Quote discount %, rounded to cents
- for each VAT rate: discounted net at that rate = (net at that rate) × (1 − Quote discount %), then VAT = discounted net × rate, rounded per rate
- gross = discounted net + Σ VAT

Spreading the discount over the rates keeps VAT per rate correct on the PDF. An amount discount on the header would need the same spreading, with a rounding cent to put somewhere. That's a reason to offer only a percentage.

**Effective discount for approvals.** Salesforce's weighted-average discount only covers the discount fields. Because our Owners can change the unit price, the threshold should be measured on **1 − net total ÷ Σ(quantity × List price)**. That means storing the List price on each Quote line when it is copied (a "list unit price" column). The List price on the Product can change later, so we can't read it from there.

## 3. Discount approval thresholds

- HubSpot: a property filter such as "quote discount > X" or "line item discount > X"; with advanced approvals, rules on amount and other properties, with up to 5 sequences ([HubSpot](https://knowledge.hubspot.com/quotes/set-up-quote-approvals)).
- Salesforce: entry criteria on the record (the Trailhead example is an Opportunity discounted more than 40 %), with a step for each level of approver ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/business_process_automation/approvals)).
- Dynamics 365: nothing built in.

A pattern that fits this team: two thresholds in Quote settings.

| Effective discount | Needs |
|---|---|
| ≤ threshold 1 (e.g. 10 %) | nothing |
| ≤ threshold 2 (e.g. 25 %) | Owner's manager |
| > threshold 2 | Owner's manager, then the manager's manager |

Rules worth copying: the Owner never approves their own Quote. If the Owner has no manager, a fallback approver set in Quote settings decides. An approval only covers the content it was given for, so any change to lines or discounts that needs approval again throws it away.

## 4. From accepted Quote to Order

**Dynamics 365:** activate the Quote, then **Create Order**, which records Date Won. "All products from the quote are copied to the order, along with its price list and currency." If sales order integration is off, **Prices Locked** is set to Yes. An order closes by being fulfilled or cancelled, and a closed or (partly) fulfilled order can't be updated ([Create or edit orders](https://learn.microsoft.com/en-us/dynamics365/sales/create-edit-order-sales)). States and status reasons ([salesorder table](https://learn.microsoft.com/en-us/dynamics365/developer/reference/entities/salesorder)):

| State | Status reasons |
|---|---|
| Active | New, Pending |
| Submitted | In Progress |
| Canceled | No Money |
| Fulfilled | Complete, Partial |
| Invoiced | Invoiced |

Only Active orders can be edited. The order header has `discountpercentage`, `discountamount`, `freightamount` and the same totals as a quote.

**Salesforce:** an Order has a status category of **Draft** or **Activated**, with picklist labels you choose. The Account and Contract can only change in Draft. The price book can't change once it is set. Editing an activated order needs a special permission, and an activated order must be deactivated before it can be deleted ([Order editing limits](https://help.salesforce.com/s/articleView?id=order_edit.htm&language=en_US&type=5)).

**HubSpot:** orders hold properties (name, currency, fulfilment status, shipping address, tracking number), line items, and links to deals, quotes, contacts, companies, payments and invoices. The pipeline is set up by you; Microsoft-style fixed statuses don't exist, and the docs' example uses Open, Paid, Processed, Shipped, Cancelled and Refunded ([HubSpot orders API](https://developers.hubspot.com/docs/api-reference/latest/crm/objects/orders/guide)). Orders come from imports, integrations (Shopify, NetSuite), workflows, manual creation (without line items), or contracts made from accepted quotes in a beta ([HubSpot order object](https://knowledge.hubspot.com/integrations/view-the-order-object)).

**What fits us.** An Order is a frozen copy of the Accepted Quote. Its fields:

- Order number
- links to the Quote, Opportunity, Account and Contact
- order date and requested delivery date
- the lines and totals, VAT per rate included
- status

For statuses, start with **Open → Fulfilled**, plus **Cancelled**, and add **Invoiced** only if invoicing ever enters scope. A plug-in fixes the lines on create and allows only status changes. This mirrors the Quote rules already in `QuotePlugin.cs`, where everything but a Draft is deactivated.

## 5. Power Platform Approvals and Dataverse, without Azure

**Power Automate Approvals** ([Get started with approvals](https://learn.microsoft.com/en-us/power-automate/get-started-approvals)):

- **Approval types:** Approve/Reject with everyone or the first to respond, custom responses, and sequential.
- **Where approvers respond:** Outlook actionable email, a Teams card, or the Power Automate action centre.
- **Licence:** the connector is **standard**, so an Office 365 licence is enough to respond.
- **Storage:** approvals are stored in Dataverse. In a non-default environment like `dev-salesapp`, **the first approval flow provisions the approvals solution, and the person who runs it must be an environment admin**.
- **Users outside the environment:** assignment fails if Entra blocks ad-hoc subscriptions or a security group controls access to the environment.

**Licensing of a flow triggered from Dataverse:** the Dataverse connector is premium. Power Apps Premium covers premium connectors "in app context", meaning a flow that "uses the same data sources as the licensed application". For an automated flow, "the flow must be associated to the app … and the owner needs Power Apps Premium". The limit is 40,000 actions a day per Premium user ([licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs)). A "Quote approval" flow on our own tables, linked to the code app, fits. **No Azure subscription, no credit card and no credits are involved.**

**The Business Approvals Kit** is overkill. It needs the Creator Kit, 19 flows and a custom connector with an Entra app registration (free, but more admin work), and its documentation points to Process or per-user licences ([setup](https://learn.microsoft.com/en-us/power-automate/guidance/business-approvals-templates/setup)).

**Dataverse itself** has no generic "submit for approval" or record lock that we can call. Locking is what our plug-ins already do: they refuse writes to a Quote that isn't a Draft.

**The identity catch with a flow:** a flow writes back to Dataverse as its connection owner, not as the person who clicked Approve in Teams. The plug-in would then see the flow's owner as the caller, so it can't check "the caller is the approver" in the same way. That works only if the flow's account is trusted to record decisions, with the responder's email from the approval output stored on the Approval row. That's acceptable, but it is a second trusted path. **This is why the recommendation is to approve in the app first** and add the flow later, only if people want approvals in Teams or Outlook.

## 6. How it fits ADR 0001 and the existing plug-ins

- The process engine (one generic plug-in on Lead, Opportunity, Account and Contact) **doesn't need to change**. Quote rules already live in their own plug-ins (`QuotePlugin`, `QuoteLinePlugin`, `QuoteTotalPlugin`), with the same rules in TypeScript (`src/sales/quotes.ts`). Discount approval belongs there: `QuoteRules` works out the effective discount and the approval it needs, and the app shows "Needs approval from …" before the user tries to Send.
- **A generic Approval table** keeps the door open for approving other things (for example a large Opportunity before Close). The process engine can use it through its existing related-record Gate ("at least 1 Approval with status Approved") and an Action ("create an Approval when entering a Step"), with no new kind of Gate. A later version could add an "approval required" Gate type if Process builders want it.
- Avoid a polymorphic "regarding" lookup, which is awkward for code apps (see [products-quotes.md](../v2/products-quotes.md)). Give the Approval table one optional lookup per table it can be about (Quote now, perhaps Opportunity later).
- **Rights:** the plug-in checks that the caller is the approver for Approve and Reject, and that the caller is the requester or Owner for Recall. Reading Approval rows follows the Quote's Owner and manager rules.

## Open points

1. **Does v3 need Orders at all?** If fulfilment and invoicing happen in another system (an accounting package), an Accepted Quote plus Close as won may be enough. Then an Order is only a hand-over record, or not needed.
2. **The threshold values and the fallback approver** (no manager, or the manager is away) are Bram's to decide. So is whether a Catalogue manager or someone else edits them.
3. **A Quote discount percentage:** add it, or keep line discounts only? It needs the VAT spreading described above and a new line on the Quote PDF's Totals Block.
4. **Approval status on the Quote:** a separate field (None, Pending, Approved, Rejected) keeps the Quote status vocabulary (Draft, Sent, Accepted, Rejected, Revised) unchanged. Adding a status like "In review" changes the glossary. I recommend the separate field.
5. **Teams/Outlook approvals later:** needs an environment admin to provision approvals in `dev-salesapp` on the first run. It also needs the trust decision about the flow identity in section 5. Check that the tenant's Entra setting `AllowAdHocSubscriptions` doesn't block assignment.
6. **List price on Quote lines:** storing a list unit price on each Quote line (and Product line) is a schema change. It's needed so the effective-discount check can't be got round by lowering the unit price.
