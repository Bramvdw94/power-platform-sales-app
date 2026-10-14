# Approvals live in our own table, decided in the app and enforced by our plug-ins

v3 adds Approvals: a Draft Quote whose discount is too high can't be Sent, and a Process Step's Gate can ask for one, until one or two Approvers agree. Power Platform has a ready-made Power Automate Approvals connector with Teams cards and Outlook actionable emails, so building our own needs a reason.

We decided:

- **Own Approval table**: one row per request, with optional lookups to the Quote, Lead or Opportunity it is about (no polymorphic Regarding), the requester, each Approver step, the status (Pending, Approved, Rejected, Recalled) and the comments.
- **Decided in the app only**: Approve and Reject are buttons in the code app and a "Waiting for my approval" list on Home. The Quote plug-in and the process engine plug-in check that the caller is the current Approver, the Approver's manager or a System Administrator, lock the record while the Approval is Pending and let an Approved approval lapse when what it covered changes.
- **The engine stays generic**: the approval check is one more Gate check ("Approved since entering this Step"), evaluated by both engines like the other checks under ADR 0001. Requesting an Approval is a user command, never an Action, a Business rule or a Decision rule.

## Considered options

- **Power Automate Approvals connector**: a flow writes the decision back as the flow's connection owner, not the person who clicked Approve, so the plug-in can no longer check who decided and the flow's account becomes a second trusted path. It also needs an environment admin to provision approvals in `dev-salesapp`, and acting from Teams is out of scope for v3 anyway.
- **Business Approvals Kit**: 19 flows, the Creator Kit and a custom connector with an Entra app registration, with Process or per-user licences behind it; far more than one team's discount approval needs.
- **A Quote status such as "In review"**: changes the Quote status vocabulary and every rule built on it; a separate Approval status keeps them apart.

Approving from Teams or Outlook can be added later as a flow that records decisions on the same table, once the trust question for the flow's account is answered.

Decided in [What an Approval is and how the process engine asks for one](https://github.com/Bramvdw94/power-platform-sales-app/issues/145), from the research in [How Salesforce, Dynamics 365 and HubSpot do approvals, Quote discounts and Orders](https://github.com/Bramvdw94/power-platform-sales-app/issues/138).
