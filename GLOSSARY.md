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

**Web Lead**:
A Lead a visitor creates by filling in the public form on the company website. Its Lead source is always Website and it starts as Not Contacted. It is created even when its email is already known, and then shows as a Possible duplicate. An Assignment rule picks its Owner.
_Avoid_: Web enquiry, inbound lead, form submission

**Rating**:
How promising a Lead looks: Hot, Warm or Cold. A Decision rule can set it from a score, and the Owner can always change it by hand. It never decides who owns the Lead.
_Avoid_: Score, Lead score, grade

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

**Forecast snapshot**:
A frozen copy, taken every Monday morning, of each open Opportunity and each one closed since the previous snapshot, with its Stage, Estimated value, Expected close date, Probability, Forecast category and Owner as they were then. Snapshots are never edited; comparing two of them shows how the Forecast moved.
_Avoid_: History, baseline, submission

**Forecast trend**:
How a period's Forecast (Closed won, Commit, Best case, Pipeline) changed over the last Forecast snapshots, set against the Quota.
_Avoid_: Deal flow, history chart

**Push count**:
How many times an Opportunity's Expected close date has moved into a later month.
_Avoid_: Slip count, delay count

**Adjustment**:
A manager's own figure for a direct report's Commit or Best case in one month, or for their team's total, with a note saying why. It sits on top of the calculated Forecast and never changes Opportunities; the calculated figure always stays visible next to it, and earlier Adjustments stay as history. Nobody adjusts their own Forecast, and the people who may see the Quota may see the Adjustment. A Reset removes the Adjustment.
_Avoid_: Override, correction, manager judgement

**Stale**:
Said of an open Opportunity that has had no activity for 14 days, whose Expected close date has passed, or that has been in the same Stage for 30 days. A Stale deal always shows which of these reasons apply.
_Avoid_: Stuck, stalled, at risk

**Last activity**:
The date of the most recent done activity on a record (a completed Task, a logged Phone Call, a Note, a sent or received Email, or a held Meeting), counting Related activity for an Account. Planned activities, Decisions and system entries never count.
_Avoid_: Last touched, last modified, last contact

**First touch**:
The first time anyone reached out to a Lead: its first done activity, or its move from Not Contacted to Working, whichever came first.
_Avoid_: First contact, first response

**Qualify rate**:
Of the Leads Qualified or Disqualified in a period, the share that were Qualified.
_Avoid_: Conversion rate, win rate

### Products

**Product**:
Something the team sells, kept in the catalogue with a code, a Unit (Piece, Hour, Day, Month or Year), a List price and a VAT rate. A Product that is no longer sold is retired: it stays on existing Product lines but can't be added to new ones.
_Avoid_: Item, article, SKU, service

**List price**:
The standard price in euros, excluding VAT, of one Unit of a Product. The team has one price list, so each Product has exactly one List price.
_Avoid_: Catalogue price, base price

**Product line**:
One Product on an Opportunity, with a quantity, a unit price and a discount percentage. The unit price starts at the List price when the line is added and the Owner may change it. The line also keeps that List price, so later changes to the List price don't touch existing lines.
_Avoid_: Line item, opportunity product

**Catalogue manager**:
A person allowed to create, change and retire Products and their List prices. Everyone in sales can read the catalogue.
_Avoid_: Product admin, Process builder

### Quotes

**Quote**:
A priced offer sent to the customer for one Opportunity. Its Quote lines are copied from the Opportunity's Product lines when it is made and are then changed on the Quote alone; nothing flows back to the Opportunity, and a Quote never changes the Estimated value. An Opportunity may have several Quotes, and a closed Opportunity gets no new ones.
_Avoid_: Offer, proposal, estimate

**Quote line**:
One Product on a Quote, with a quantity, a unit price, a discount percentage, the Product's VAT rate and the List price it was added at. Amounts on a line exclude VAT; VAT is worked out per rate on the Quote's total, after any Quote discount.
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
Recording that the customer agreed to a Quote. The Opportunity's other Sent Quotes become Rejected and the user is offered to Close the Opportunity as won at the Quote's net total (after any Quote discount) and to Create an Order.
_Avoid_: Win, sign, approve

**Quote template**:
The layout of a Quote's PDF: an ordered list of Blocks with their options, and a page style (accent colour, typeface, logo position, language). A Catalogue manager designs several; exactly one is the Default, which a Quote uses unless its Owner picks another while it is a Draft. Editing a template never changes a PDF that was already sent.
_Avoid_: PDF layout, Quote design

**Block**:
One part of a Quote template's page: Header, Customer address, Reference strip, Title and intro, Product lines, Totals and VAT per rate, Terms, Your contact person, Acceptance and signature, or Footer. Each appears at most once. Product lines, Totals and the Footer are always on the page; the Footer stays at the bottom.
_Avoid_: Section, widget, component

**Quote settings**:
The one record of company details (name, logo, address, phone, email, website, KvK, btw-id, IBAN), default validity, terms link and text, the two Discount thresholds, and the email subject and message templates behind every Quote PDF and Quote email. A Catalogue manager edits it; everyone in sales reads it.
_Avoid_: Company settings, PDF settings

**Send**:
Delivering a Draft Quote to the customer in one of two ways, by email from the user's own Outlook or by downloading the PDF to send by hand. Either way the exact PDF is stored on the Quote and the Quote becomes Sent, with when, by whom, how and to which address recorded. Download PDF on a Sent Quote returns that stored copy. A Draft whose discount needs an Approval can only be Sent once it is Approved.
_Avoid_: Issue, Publish, Mail merge

**Quote discount**:
One optional percentage off a whole Quote, taken after the line discounts and before VAT, and shared over the VAT rates so VAT per rate stays right. On the PDF it shows between the Subtotal and the Net total. There is no discount as an amount, and Opportunities have no such discount.
_Avoid_: Header discount, total discount, Effective discount

**Effective discount**:
How far below List price a Quote is in total: one minus its net total divided by the sum of quantity times List price over its lines. It counts lowered unit prices as well as line and Quote discounts, and is what the Discount thresholds are measured against.
_Avoid_: Quote discount, average discount

**Discount threshold**:
One of two percentages in Quote settings that decide which Approval a Draft Quote needs before it can be Sent: up to the first (10 % by default) none, up to the second (25 % by default) the Owner's manager, above it the Owner's manager and then their manager. A revision is measured again from scratch.
_Avoid_: Discount limit, approval level

### Orders

**Order**:
The customer's confirmed purchase, made with Create Order from an Accepted Quote once its Opportunity is Closed Won. It has its own Order number and keeps a frozen copy of the Quote's lines, Quote discount, totals and VAT per rate; only the requested delivery date, the customer's PO number and a note can change. One Quote gives at most one Order. It starts with the Quote's Owner, everyone reads it, the Owner or the Owner's manager changes it, and it is never deleted. An Order never changes its Opportunity.
_Avoid_: Sales order, purchase, deal

**Order status**:
Where an Order stands: Open, then Fulfilled (delivered) or Cancelled (with a comment). Fulfilled and Cancelled are final.
_Avoid_: Order stage, Invoiced, Closed

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

**Assignment rule**:
The ordered list of entries a Process builder builds that picks the Owner of each new Web Lead. Each entry has a condition and sends a matching Lead to one named salesperson or round robin over a group; the first entry that matches and has someone available wins, and the Fallback Owner gets any Lead no entry places. It never changes the Owner of a Lead created by hand or by Import, and never looks at Rating.
_Avoid_: Routing rule, Entry criteria, assign Action

**Round robin**:
Taking turns: each new Web Lead an Assignment rule entry places goes to the next person in that entry's group who is not Away, in a fixed order, however much work they already have.
_Avoid_: Load balancing, rotation

**Fallback Owner**:
The one salesperson who gets a Web Lead when no Assignment rule entry places it, because none matches or everyone it names is Away. A Process builder sets it.
_Avoid_: Default owner, queue

**Away**:
A salesperson being unavailable for new Web Leads, switched on by them or their manager, optionally until a return date. Round robin skips them and an entry naming only them is passed over. Being Away changes nothing else: they keep their records and still get Approvals.
_Avoid_: Out of office, absent, inactive

**Delete**:
Removing a record made by mistake, together with what belongs only to it. Only the Owner or the Owner's manager may delete, and also the author of a Note. Qualified Leads, closed Opportunities and Products are never deleted, and an Account is not deleted while it still has Contacts or Opportunities. A deleted record can be restored by an administrator for 14 days. Ending a real record is done with Disqualify, Close or Retire, not Delete.
_Avoid_: Remove, archive, deactivate

**Notification**:
A short message telling one person that something happened that needs their attention, with a link to the record it is about. Only that person sees it. It shows on the bell in the app until it is deleted 30 days after it was sent, and is marked read when they open it. In v3 a Notification is sent when a record is Reassigned to someone else, when an Assignment rule makes them Owner of a Web Lead, when an engine notify Action names them, when an Approval is requested of them or their request is decided, when an Engine error happens (to Process builders), and when a Decision needs review (to the record's Owner, or the Decision rule's Reviewer).
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
The checks a record must pass to leave a Step forward: a field has a value, a field meets a condition, the record has enough related records (such as a completed Phone Call or a held Meeting), or it was Approved since entering the Step. Moving back is never gated. Closed Won must pass the last Step's Gate, from whichever Step it is closed.
_Avoid_: Validation, exit criteria, requirement

**Action**:
Something the app does by itself when a record enters a Step or when a Decision rule gives its answer: create a Task, set a field, assign an Owner (a named salesperson or the Owner's manager, as with Reassign) or notify someone (the Owner, the Owner's manager or a named person, never the person whose save caused it). Actions never run when a record leaves a Step or because a Business rule holds.
_Avoid_: Trigger, automation, Next step

**Key fields**:
The fields a Step puts in front of the user while the record is on that Step.
_Avoid_: Step fields

**Guidance**:
Tips text a Step shows the user on how to work the record at that point.
_Avoid_: Help, instructions

**Business rule**:
An if/then rule a Process builder builds that applies to every record of one table (Lead, Opportunity, Account, Contact or Quote) whenever its condition holds, whichever Step the record is on, or whether it follows a Process at all. It makes a field required, read-only or Hidden, sets a value, warns, or blocks the save; it never runs Actions. A required or block save rule only stops a save that creates the record, changes a field the rule depends on, or moves its Step, Stage or status; Reassign, Close as lost, Disqualify, Switch Process and Move to latest version are never stopped by a Business rule. On a Quote a rule applies only while it is a Draft, and Send counts as the move; Accept, Reject and Revise are never stopped.
_Avoid_: Validation rule, policy, automation

**Hidden**:
A Business rule effect that takes a field off the record and its Key fields while the rule's condition holds. The field keeps its value and still shows in lists and exports: Hidden tidies the record, it does not keep anything secret. A hidden field that is empty while it is required, or while the current Gate needs it, shows anyway.
_Avoid_: Invisible, secret, show/hide

**Condition group**:
A set of conditions that must all hold, or of which any one must hold, placed inside the conditions of a Business rule, Gate, Entry criteria or Decision rule, such as "Stage is Proposal and (value over €50,000 or Account type is Key)". Groups go one level deep.
_Avoid_: Clause, nested filter, bracket

**Entry criteria**:
The conditions that decide which Process a new Lead or Opportunity gets. Each table's Processes are in a priority order and the first one whose Entry criteria match wins; one Process may be the fallback, with no criteria. A record that matches none follows no Process. The Process is picked once, when the record is created, and never changes by itself afterwards.
_Avoid_: Assignment rule, filter, trigger

**Switch Process**:
Moving a record to another Process, or to none. Only the Owner's manager or a Process builder may do it. The record lands on the first Step that maps to its current Stage or Lead status, without checking Gates, and its progress on the old Process is not kept.
_Avoid_: Change process, reassign

**Publish**:
Making a draft Process, Business rule or Decision rule take effect. Until then edits change nothing for users. Publishing a Process makes a new Process version; Business rules and Decision rules have no versions, so a published change or turning one off applies to every record at once.
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
A person allowed to build and Publish Processes, Business rules and Decision rules. It is a right given separately from being a manager; everyone in sales can read the definitions.
_Avoid_: Admin, designer, customizer

**Engine error**:
A Business rule, Action or Decision rule that could not run on a record, for example because a field it uses was removed. The save goes through without it, and the Process builder sees the error on the rule or Process to fix it.
_Avoid_: Rule failure, crash, bug

**Decision rule**:
A rule a Process builder builds that asks Jev one question about a record when it is created (a Lead, Opportunity, Account or Contact) or when an incoming Email is logged, and then runs the Actions for the answer. The question is a yes or no, a pick from a list, or a score; a score is answered in bands such as "strong fit or better". It reads only the fields the rule names, and its Actions are limited to ones that can be undone: set a field, assign an Owner, create a Task or notify. It never deletes, closes, qualifies, disqualifies, moves a Step, sends email or approves. Its answer arrives a moment after the save.
_Avoid_: AI rule, scoring rule, Business rule, automation

**Jev**:
The outside decision model a Decision rule asks. It only picks among the answers the rule defines, each with a confidence; it writes no text.
_Avoid_: AI, the model, Copilot

**Decision**:
One answer to a Decision rule about one record: the answer, how confident it was, and whether Jev or a person gave it. Each Decision shows on the record's timeline. A Decision keeps nothing on the record by itself; an answer stays on the record only when the rule sets a field with it.
_Avoid_: Prediction, score, result

**Needs review**:
A Decision that Jev could not settle: its confidence was below the rule's threshold, the input looked like it was trying to steer the answer, Jev could not be reached, or a spending cap was reached. The record's Owner, or the rule's Reviewer while the Owner is not a salesperson, picks the answer, which then runs that answer's Actions, or dismisses it.
_Avoid_: Pending, low confidence, manual check

**Ask again**:
The Owner or their manager asking a record's Decision rule once more, for example after correcting the record.
_Avoid_: Rerun, rescore, refresh

**Try**:
Running a Decision rule, published or not, on chosen records or on pasted sample text to see its answer, confidence and the Actions it would run, without running them or changing anything.
_Avoid_: Test run, simulate, preview

### Approvals

**Approval**:
A request, made by a user when the record is ready, for one or two people in turn to agree to a Draft Quote before it is Sent or to a Lead or Opportunity before it leaves a Step whose Gate asks for one. While it is Pending the record and its lines are read-only, though Notes and Activities can still be added; Reassign or Switch Process recalls it. It is Approved when the last Approver approves and Rejected as soon as one rejects, with a comment; a rejected record can be changed and asked again. An Approved approval lapses when what it covered changes (on a Quote its lines, prices or discounts; on an Opportunity its Estimated value or Product lines). It has no expiry date, and Decision rules never request or decide one.
_Avoid_: Sign-off, review, approve (for Accept)

**Approver**:
A person an Approval waits on: the Owner's manager, the Owner's manager and then their manager, or a named person, as the Gate or the Quote discount sets. The requester never approves their own request, so it goes one level up, and with nobody left to the Fallback approver. The Approver's own manager or a System Administrator may decide in their place.
_Avoid_: Reviewer, signer

**Fallback approver**:
The one person an Approval goes to when there is no one else to ask: the Owner has no manager, or the chain would come back to the requester. A Process builder sets it.
_Avoid_: Default approver, admin

**Recall**:
Withdrawing a Pending Approval, by the requester, the Owner or the Owner's manager. The record is unlocked as if nothing was asked.
_Avoid_: Cancel, withdraw

**Approval status**:
Where a Draft Quote's discount approval stands: None, Pending, Approved or Rejected. It sits beside Quote status and never changes it.
_Avoid_: In review, Quote status

### AI assist

**AI assist**:
Text the app writes for a person when they ask for it: a Timeline summary, a Follow-up draft or a Suggested Next step. It only ever appears as a draft for that person to read, change, keep or throw away; it never changes a record or sends anything by itself. Jev decides, AI assist writes.
_Avoid_: Copilot, Jev, AI (for Decision rules)

**Timeline summary**:
A short written account of where an Account or Opportunity stands, made from its key fields and its recent Activities (for an Account, its Related activity too). It is shown once to the person who asked and is gone when they leave, unless they save it as a Note, which is then marked as written with AI.
_Avoid_: Recap, digest, overview

**Follow-up draft**:
An email written for the person who logged a Phone Call or held a Meeting, addressed to the Contacts who were in it, ready for them to change and send. It is sent only when they press Send.
_Avoid_: Auto-reply, template, follow-up (for a Task)

**Suggested Next step**:
A Next step proposed for an open Opportunity from its fields, recent Activities and the current Step's Guidance. It becomes the Next step only when the Owner or their manager accepts it and saves.
_Avoid_: Recommendation, Action
