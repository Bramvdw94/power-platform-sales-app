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
What an open Opportunity is expected to be worth, in euros excluding VAT. While the Opportunity has Product lines it is their total and can't be typed over; without lines the Owner enters it. It is replaced by the actual value when the Opportunity is Closed Won.
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

### Forecasting

**Forecast category**:
How firmly the Owner counts on an open Opportunity: Pipeline, Best case, Commit, or Omitted (not counted at all). Each open Stage gives a default (Qualification and Needs Analysis Pipeline, Proposal Best case, Negotiation Commit) that the Owner may override; changing the Stage, or reopening, resets it to the default. A closed Opportunity counts as won or lost by its Stage, never by its Forecast category.
_Avoid_: Forecast stage, confidence, Won, Lost

**Forecast**:
The expected sales of a person or team per month or quarter: what is already Closed won, plus open Opportunities in their Expected close month, added up by Forecast category and weighted by Probability, set against the Quota.
_Avoid_: Projection, prediction, pipeline

**Quota**:
The amount in euros a salesperson is expected to win in one month. A quarter's Quota is the sum of its months. A salesperson's manager sets it, and nobody sets their own; only the salesperson and their manager may see it.
_Avoid_: Target, goal, budget

**Gap**:
How much of the Quota is not yet Closed won in a period.
_Avoid_: Shortfall, remaining

### Products

**Product**:
Something the team sells, kept in the catalogue with a code, a Unit (Piece, Hour, Day, Month or Year), a List price and a VAT rate. A Product that is no longer sold is retired: it stays on existing Product lines but can't be added to new ones.
_Avoid_: Item, article, SKU, service

**List price**:
The standard price in euros, excluding VAT, of one Unit of a Product. The team has one price list, so each Product has exactly one List price.
_Avoid_: Catalogue price, base price

**Product line**:
One Product on an Opportunity, with a quantity, a unit price and a discount percentage. The unit price starts at the List price when the line is added and the Owner may change it; later changes to the List price don't touch existing lines.
_Avoid_: Line item, opportunity product

**Catalogue manager**:
A person allowed to create, change and retire Products and their List prices. Everyone in sales can read the catalogue.
_Avoid_: Product admin, Process builder

### Quotes

**Quote**:
A priced offer sent to the customer for one Opportunity. Its Quote lines are copied from the Opportunity's Product lines when it is made and are then changed on the Quote alone; nothing flows back to the Opportunity, and a Quote never changes the Estimated value. An Opportunity may have several Quotes, and a closed Opportunity gets no new ones.
_Avoid_: Offer, proposal, estimate

**Quote line**:
One Product on a Quote, with a quantity, a unit price, a discount percentage and the Product's VAT rate. Amounts on a line exclude VAT; VAT is worked out per rate on the Quote's total.
_Avoid_: Line item, quote product

**Quote status**:
Where a Quote stands: Draft (being prepared, the only status in which it can be changed or deleted), Sent, Accepted, Rejected, or Revised (replaced by a newer revision). A Sent Quote past its Valid until date shows as expired but keeps its status.
_Avoid_: Quote stage, Expired, Won

**Valid until**:
The last day the customer can accept a Quote at its prices.
_Avoid_: Expiry date, due date

**Revise**:
Replacing a Sent Quote with a new Draft that keeps its Quote number with the next revision number; the old one becomes Revised.
_Avoid_: Copy, new version, amend

**Accept**:
Recording that the customer agreed to a Quote. The Opportunity's other Sent Quotes become Rejected and the user is offered to Close the Opportunity as won at the Quote's net total.
_Avoid_: Win, sign, approve

**Quote template**:
The layout of a Quote's PDF: an ordered list of Blocks with their options, and a page style (accent colour, typeface, logo position, language). A Catalogue manager designs several; exactly one is the Default, which a Quote uses unless its Owner picks another while it is a Draft. Editing a template never changes a PDF that was already sent.
_Avoid_: PDF layout, Quote design

**Block**:
One part of a Quote template's page: Header, Customer address, Reference strip, Title and intro, Product lines, Totals and VAT per rate, Terms, Your contact person, Acceptance and signature, or Footer. Each appears at most once. Product lines, Totals and the Footer are always on the page; the Footer stays at the bottom.
_Avoid_: Section, widget, component

**Quote settings**:
The one record of company details (name, logo, address, phone, email, website, KvK, btw-id, IBAN), default validity, terms link and text, and the email subject and message templates behind every Quote PDF and Quote email. A Catalogue manager edits it; everyone in sales reads it.
_Avoid_: Company settings, PDF settings

**Send**:
Delivering a Draft Quote to the customer in one of two ways, by email from the user's own Outlook or by downloading the PDF to send by hand. Either way the exact PDF is stored on the Quote and the Quote becomes Sent, with when, by whom, how and to which address recorded. Download PDF on a Sent Quote returns that stored copy.
_Avoid_: Issue, Publish, Mail merge

### Activities

**Activity**:
Something a salesperson recorded or planned against a Lead, Opportunity, Account or Contact: a Note, a Task, a Phone Call, an Email or a Meeting.
_Avoid_: Interaction, touchpoint

**Note**:
Free text kept on a record for later reference, optionally with one attached file added when it is written.
_Avoid_: Comment, memo

**Task**:
A to-do with a due date, open until it is completed.
_Avoid_: Reminder, follow-up

**Phone Call**:
A call made or received, logged after it happened, or planned for later.
_Avoid_: Call log

**Email**:
An email between a salesperson and a Contact, Account or Lead. It is logged by itself when it passes through the salesperson's mailbox to or from someone the app knows, or when it is sent from a record in the app; a salesperson can also log one by hand from Outlook. Removing an Email from the app leaves the mail in Outlook.
_Avoid_: Mail, message, correspondence

**Meeting**:
An appointment with Contacts, Accounts or Leads, planned from a record in the app or tracked by the salesperson from their Outlook calendar. It is Planned until its end time has passed and then counts as held, with no step to complete it; a cancelled Meeting stays on record as Cancelled.
_Avoid_: Appointment, event, call

**Regarding**:
The one Lead, Opportunity, Account or Contact an Activity is about. A logged Email or Meeting gets it by itself when its people point to exactly one open Opportunity (as its Primary Contact) or else exactly one open Lead, or when it replies to an Email that already has one; otherwise it is Unlinked. The Activity's Owner or their manager may change or clear it.
_Avoid_: Related to, linked record, parent

**Unlinked**:
A logged Email or Meeting with no Regarding yet. It still shows on the timelines of the Contacts, Accounts and Leads it was with, and waits in its Owner's "To link" list with suggested records.
_Avoid_: Untracked, orphan, unresolved

**Related activity**:
An Activity shown on an Account although it belongs to another record: one of the Account's current Contacts, one of its Opportunities, or the Lead such an Opportunity was qualified from.
_Avoid_: Rollup, inherited activity

### People

**Owner**:
The salesperson responsible for a record; the owner and the owner's manager may change it, everyone else may only read it.
_Avoid_: Assignee, rep

**Reassign**:
Making another salesperson the Owner of a record. Only the Owner or the Owner's manager may reassign, and also a Qualified Lead or a closed Opportunity. The record's open Tasks and Phone Calls move with it; reassigning an Account leaves its Contacts and Opportunities with their own Owners.
_Avoid_: Transfer, hand over, assign

**Delete**:
Removing a record made by mistake, together with what belongs only to it. Only the Owner or the Owner's manager may delete, and also the author of a Note. Qualified Leads, closed Opportunities and Products are never deleted, and an Account is not deleted while it still has Contacts or Opportunities. A deleted record can be restored by an administrator for 14 days. Ending a real record is done with Disqualify, Close or Retire, not Delete.
_Avoid_: Remove, archive, deactivate

**Notification**:
A short message telling one person that something happened that needs their attention, with a link to the record it is about. Only that person sees it. It shows on the bell in the app until it is deleted 30 days after it was sent, and is marked read when they open it. In v3 a Notification is sent when a record is Reassigned to someone else, when an engine notify Action names them, when an Approval is requested of them or their request is decided, when an Engine error happens (to Process builders), and when a Decision rule's answer needs review (to the record's Owner).
_Avoid_: Alert, message, activity

**Teams copy**:
The same Notification also sent to the person as a Teams chat message. It is only a notice: reading it does not mark the Notification read, and nothing can be done from Teams. Each person can switch Teams copies off for themselves; the bell always stays on.
_Avoid_: Teams notification, push

### Lists

**Saved view**:
A named way of looking at the Leads, Opportunities, Accounts or Contacts list: which records (My, My team or All, narrowed by filters), in what order, and with which columns. It belongs to the person who saved it; they may share it with the team, who can then use it but not change it. Each person may make one view per list their default.
_Avoid_: Filter, list, query, report

**Import**:
One upload of a CSV file of up to 5,000 rows that creates new Leads, Accounts or Contacts; it never changes records that already exist. Anyone in sales may import. The importer owns the new records unless a row names another Owner they are allowed to Reassign to. Only the rows the importer ticks are created; rows with errors are left out and can be downloaded to fix and import again. Each Import is kept with who ran it, when, the file name and how many rows were created or failed.
_Avoid_: Upload, migration, data load

**Undo import**:
Deleting the records an Import created, within 14 days of it, by the importer or their manager. It follows the Delete rules, so records that may no longer be deleted (a Qualified Lead, an Account that now has Contacts or Opportunities) stay and are listed.
_Avoid_: Rollback, revert

**Possible duplicate**:
An existing Lead, Contact or Account that looks like the record being saved or imported: the same email, the same name (a Lead's company and last name, a Contact's first and last name at the same Account), or for an Account the same website domain. A new Lead is also checked against Contacts by email. The person is warned and may open the match or save anyway; nothing is ever blocked or merged.
_Avoid_: Duplicate rule, conflict, match

### Processes

**Process**:
An ordered list of Steps that a Process builder builds to guide Leads or Opportunities towards Qualify or Close. A Lead Process ends at Qualify; the new Opportunity then follows its own Opportunity Process, so no Process spans both. Processes apply organisation-wide, whoever owns the record.
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
An if/then rule a Process builder builds that applies to every record of one table (Lead, Opportunity, Account or Contact) whenever its condition holds, whichever Step the record is on, or whether it follows a Process at all. A required or block save rule only stops a save that creates the record, changes a field the rule depends on, or moves its Step, Stage or status; Reassign, Close as lost, Disqualify, Switch Process and Move to latest version are never stopped by a Business rule.
_Avoid_: Validation rule, policy, automation

**Entry criteria**:
The conditions that decide which Process a new Lead or Opportunity gets. Each table's Processes are in a priority order and the first one whose Entry criteria match wins; one Process may be the fallback, with no criteria. A record that matches none follows no Process. The Process is picked once, when the record is created, and never changes by itself afterwards.
_Avoid_: Assignment rule, filter, trigger

**Switch Process**:
Moving a record to another Process, or to none. Only the Owner's manager or a Process builder may do it. The record lands on the first Step that maps to its current Stage or Lead status, without checking Gates, and its progress on the old Process is not kept.
_Avoid_: Change process, reassign

**Publish**:
Making a draft Process or Business rule take effect. Until then edits change nothing for users. Publishing a Process makes a new Process version; a Business rule has no versions, so a published change or turning it off applies to every record at once.
_Avoid_: Activate, deploy, save

**Process version**:
A Process as it stood at one Publish. A record follows the Process version it started on until it is moved; closed, qualified and disqualified records keep theirs for good, and a reopened record carries on with its own.
_Avoid_: Revision, release

**Move to latest version**:
A Process builder moving every open record on older versions of a Process onto its latest Process version in one go. A record stays on its Step when that Step still exists and maps to the same Stage or Lead status; otherwise it lands as with Switch Process. Gates are not checked and Actions do not run.
_Avoid_: Upgrade, migrate, republish

**Retire**:
Stopping a published Process from being picked for new records. Records already on it keep following it to the end; a Process builder can Switch Process for all of them at once.
_Avoid_: Delete, deactivate, turn off

**Process builder**:
A person allowed to build and Publish Processes and Business rules. It is a right given separately from being a manager; everyone in sales can read the definitions.
_Avoid_: Admin, designer, customizer

**Engine error**:
A Business rule or Action that could not run on a record, for example because a field it uses was removed. The save goes through without it, and the Process builder sees the error on the rule or Process to fix it.
_Avoid_: Rule failure, crash, bug
