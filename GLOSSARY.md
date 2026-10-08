# Sales

The sales app tracks the organisations and people a sales team sells to, and the deals it works from first contact to won or lost. It replaces Dynamics 365 Sales for one sales team.

## Language

### Customers

**Account**:
An organisation the team sells to or has sold to.
_Avoid_: Company, customer, client

**Contact**:
A person the team deals with, usually working at an Account.
_Avoid_: Person, customer

### Pipeline

**Lead**:
A prospect that has not yet been qualified: someone who might want to buy, but with no confirmed deal.
_Avoid_: Prospect, enquiry

**Qualify**:
The step that turns a Lead into a real deal, producing an Opportunity linked to an Account and a Contact.
_Avoid_: Convert, promote

**Disqualify**:
The step that closes a Lead with no deal, because it will not lead to a sale. A disqualified Lead can be reopened; a qualified one cannot.
_Avoid_: Reject, delete

**Lead status**:
Where a Lead stands: Not Contacted (nobody has reached out yet), Working (the Owner is in touch and judging fit, including Leads that are a good fit but not ready yet), Qualified, or Disqualified.
_Avoid_: Lead stage, Nurturing, Converted

**Disqualify reason**:
Why a Lead was disqualified: No budget, No need, Can't reach them, Chose a competitor, Duplicate, or Other. "Not ready yet" is not a reason; such a Lead stays Working.
_Avoid_: Lost reason, bad timing

**Opportunity**:
A qualified deal with an expected value and close date, which moves through stages until it is won or lost.
_Avoid_: Deal, sale, prospect

**Stage**:
Where an Opportunity stands: Qualification, Needs Analysis, Proposal, Negotiation (the open stages), then Closed Won or Closed Lost. An Opportunity may move forward, back or skip stages; a closed one can be reopened only by its Owner or their manager.
_Avoid_: Status, phase, step

**Probability**:
How likely an Opportunity is to be won, as a percentage. Each Stage gives a default (Qualification 10, Needs Analysis 25, Proposal 50, Negotiation 75, Closed Won 100, Closed Lost 0) that the Owner may override.
_Avoid_: Confidence, chance

**Close**:
Moving an Opportunity to Closed Won or Closed Lost, recording the close date and, when won, the actual value.
_Avoid_: Finish, complete

**Lost reason**:
Why an Opportunity was closed as lost: Price, Chose a competitor, No budget, No decision, or Other.
_Avoid_: Disqualify reason

**Pipeline**:
All open Opportunities, viewed by stage.
_Avoid_: Funnel

### People

**Owner**:
The salesperson responsible for a record; the owner and the owner's manager may change it, everyone else may only read it.
_Avoid_: Assignee, rep
