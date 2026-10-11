# Sales

The sales app tracks the organisations and people a sales team sells to, and the deals it works from first contact to won or lost. It replaces Dynamics 365 Sales for one sales team.

## Language

### Customers

**Account**:
An organisation the team sells to or has sold to.
_Avoid_: Company, customer, client

**Account type**:
What kind of relationship the team has with an Account: Prospect, Customer, Partner, Reseller, Supplier, Competitor, or Other.
_Avoid_: Relationship type, category, customer type

**Industry**:
The line of business an Account works in.
_Avoid_: Sector, vertical

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
A qualified deal with one Account, an Estimated value and an Expected close date, which moves through stages until it is won or lost.
_Avoid_: Deal, sale, prospect

**Stage**:
Where an Opportunity stands: Qualification, Needs Analysis, Proposal, Negotiation (the open stages), then Closed Won or Closed Lost. An Opportunity may move forward, back or skip stages; a closed one can be reopened only by its Owner or their manager.
On an Opportunity that follows a Process, the Stage follows its current Step instead of being picked directly.
_Avoid_: Status, phase

**Probability**:
How likely an Opportunity is to be won, as a percentage. Each Stage gives a default (Qualification 10, Needs Analysis 25, Proposal 50, Negotiation 75, Closed Won 100, Closed Lost 0) that the Owner may override.
_Avoid_: Confidence, chance

**Close**:
Moving an Opportunity to Closed Won or Closed Lost, recording the close date and, when won, the actual value.
_Avoid_: Finish, complete

**Lead source**:
Where a Lead came from: Website, Referral, Event, Cold outreach, Partner, or Other. It carries over to the Opportunity on Qualify.
_Avoid_: Origin, channel, campaign

**Estimated value**:
What an open Opportunity is expected to be worth, in euros. It is replaced by the actual value when the Opportunity is Closed Won.
_Avoid_: Amount, revenue, deal size

**Expected close date**:
When the Owner expects an open Opportunity to close. The close date records when it actually did.
_Avoid_: Target date, due date

**Next step**:
A short note on an open Opportunity saying what happens next to move it forward.
_Avoid_: Action, follow-up

**Primary Contact**:
The one Contact an Opportunity is worked through. Other people at the customer are found through the Account.
_Avoid_: Decision maker, stakeholder

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

**Reassign**:
Making another salesperson the Owner of a record. Only the Owner or the Owner's manager may reassign, and also a Qualified Lead or a closed Opportunity. The record's open Tasks and Phone Calls move with it; reassigning an Account leaves its Contacts and Opportunities with their own Owners.
_Avoid_: Transfer, hand over, assign

### Processes

**Process**:
An ordered list of Steps that a manager builds to guide Leads or Opportunities towards Qualify or Close. A Lead Process ends at Qualify; the new Opportunity then follows its own Opportunity Process, so no Process spans both.
_Avoid_: Flow, workflow, business process flow, playbook, pipeline

**Step**:
One stop in a Process. On an Opportunity each Step maps to one open Stage, and several Steps may map to the same Stage, in Stage order; on a Lead each Step maps to an open Lead status (Not Contacted or Working). The record moves forward or back one Step at a time and its Stage or Lead status follows. Close, Qualify and Disqualify stay outside the Steps: Close and Disqualify are possible from any Step, and leaving a Lead's last Step means Qualify.
_Avoid_: Stage, phase, milestone

**Gate**:
The checks a record must pass to leave a Step forward: a field has a value, a field meets a condition, or the record has enough related records (such as a completed Phone Call). Moving back is never gated. Closed Won must pass the last Step's Gate, from whichever Step it is closed.
_Avoid_: Validation, exit criteria, requirement

**Action**:
Something the app does by itself when a record enters a Step, such as creating a Task.
_Avoid_: Trigger, automation, Next step

**Key fields**:
The fields a Step puts in front of the user while the record is on that Step.
_Avoid_: Step fields

**Guidance**:
Tips text a Step shows the user on how to work the record at that point.
_Avoid_: Help, instructions

**Business rule**:
An if/then rule a manager builds that applies to every record of one table (Lead, Opportunity, Account or Contact) whenever its condition holds, whichever Step the record is on, or whether it follows a Process at all.
_Avoid_: Validation rule, policy, automation
