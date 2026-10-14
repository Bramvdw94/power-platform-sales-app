# Dataverse security model: "everyone reads, owner + owner's manager edits"

Research for GitHub issue #8. Researched 2026-10-08 from Microsoft Learn pages only. Each claim links to the page it comes from.

## Answer

- **Recommendation:** use one custom **"Salesperson" security role** in the root business unit. Give it **Organization-level Read** and **User-level Write** (plus User-level Create, Delete and Assign) on Account, Contact, `Lead` and `Opportunity`. Then turn on the **Manager hierarchy model** (Depth 1) and set each user's **Manager** field. Those two together give exactly the rule we want: everyone reads everything, the owner edits, and the owner's direct manager gets Read/Write/Append/AppendTo on the report's records.
- Set **Append To on Account and Contact to Organization level**. If you leave it at User level, a salesperson can't link their Opportunity or Contact to an Account someone else owns.
- **Don't use extra business units or teams for this.** One root BU is enough. Microsoft says to keep BUs few and to treat sharing as a way to handle exceptions. Position hierarchy only adds anything if the "manager" isn't the person on the Entra/user Manager field.
- **Simpler fallback for one small team:** give the single sales manager a second role with Organization-level Write. Nothing needs hierarchy configuration, but the manager can then edit *every* record, not only their reports' records.
- **Licences:** everything above is standard Dataverse security. It needs no Dynamics 365 licence, because Account, Contact and custom tables aren't restricted tables. Each user needs a licence that runs code apps on Dataverse: **Power Apps Premium** (or per-app, pay-as-you-go, or an App Pass).
- **Test before relying on it:** two Microsoft pages disagree on which Read level the manager needs for hierarchy access (see 2.3). Prove it in a dev environment with 3 test users.

---

## 1. Building blocks (what Dataverse offers)

- **Security roles and access levels.** A privilege is set at one of five levels: None, User, Business Unit, Parent:Child BU, or Organization. "User: Users can access records they own, objects that are shared with the organization, objects that are shared with them, and objects that are shared with a team that they're a member of." "Organization: Users can access all records in the organization, regardless of the business unit…" The record privileges are Create, Read, Write, Delete, Append, Append To, Assign and Share. — https://learn.microsoft.com/en-us/power-platform/admin/security-roles-privileges
- **Roles add up.** "Security role privileges are cumulative. Users are granted the privileges that are available in each role assigned to them." — https://learn.microsoft.com/en-us/power-platform/admin/security-roles-privileges. "A user's record access combines all their security roles, business unit membership, team memberships, and shared records." — https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds
- **Each privilege has its own level.** That is why "Read = Organization, Write = User" works on one role: the access level is set separately for every privilege on every table. — https://learn.microsoft.com/en-us/power-platform/admin/security-roles-privileges
- **Other features:** business units, owner teams, access teams, Entra group teams, record sharing, hierarchy security, column-level security, and filtered record ownership (preview). — https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds
- **How Dataverse decides access.** It combines four sources: ownership, role access level, shared access, and hierarchy access. — https://learn.microsoft.com/en-us/power-platform/admin/how-record-access-determined

## 2. Options compared

### (a) Security role: Organization Read + User Write

**What to configure**
- Create a custom role in the **root business unit**. Copy Basic User or App Opener as the starting point; Microsoft calls these "the minimum privileges to run an app" and "the minimum privileges and including privileges to the core business tables" — https://learn.microsoft.com/en-us/power-platform/admin/security-roles-privileges. Microsoft also says it's best to create roles at the root BU because they're "automatically duplicated for all child business units and can be included in solutions" — https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-ce
- Suggested settings for Account, Contact, Lead and Opportunity:

| Privilege | Level | Why |
|---|---|---|
| Create | User | Users create records they own |
| Read | **Organization** | Everyone reads all |
| Write | **User** | Only the owner edits (the manager gets in through hierarchy) |
| Delete | User (or None) | Your choice. Hierarchy doesn't grant Delete to managers. |
| Append | User | Lets a user attach their own record to another record |
| Append To | **Organization** on Account/Contact | So anyone can set the Account lookup on their Opportunity or Contact (see below) |
| Assign | User | Owner can hand a record over. Hierarchy doesn't grant Assign. |
| Share | None | Microsoft advises turning off share rights where possible |

- **Append To is set per level.** "The records that can be appended to depend on the access level of the permission defined in your security role." — https://learn.microsoft.com/en-us/power-platform/admin/how-record-access-determined. With User-level Append To on Account, a rep can't point their Opportunity at another rep's Account. Setting Organization-level Append To on Account and Contact allows linking, and linking doesn't let anyone edit the Account itself.
- **Share rights:** "Turn off share rights in security roles where possible." — https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-ce

**Trade-offs**
- On its own, this covers "everyone reads, owner edits" but **not "manager edits"**. It needs (b), or a separate manager role (see 2.4).
- It's the cheapest option and the fastest to evaluate. Microsoft describes BU- and role-based access as "optimal access checking" compared with sharing — https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-ce
- Roles are solution-aware, so they move between environments with the app — https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds

**Licences:** standard Dataverse. "The user must have an appropriate Dataverse license." — https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds

### (b) Hierarchy security: manager hierarchy or position hierarchy

All points below are from https://learn.microsoft.com/en-us/power-platform/admin/hierarchy-security unless another link is given.

**What it grants**
- Manager model: "For a direct report, the manager has Read, Write, Append, AppendTo access to the report's data." "For a nondirect report in the same management chain … read-only access."
- Position model: "The direct higher positions have Read, Write, Append, AppendTo access to the lower positions' data in the direct ancestor path." Unlike the manager model, positions work across business units.
- Hierarchy access never grants Delete, Assign or Share. Only Read, Write, Append and AppendTo are listed, so a manager can edit a report's record but can't delete or reassign it unless a role allows that.
- Hierarchy adds access on top of roles. It doesn't remove any: "additional access can be obtained by using other forms of security, such as security roles."

**What to configure**
1. In the Power Platform admin center: Environment > Settings > Users + Permissions > **Hierarchy security**. Select **Enable Manager Hierarchy Model**. It's "disabled by default".
2. Set **Depth**. Depth 1 is enough for one manager over reps. Deeper levels only add read-only access, which everyone already has through Organization Read.
3. Set **Manager** (`parentsystemuserid`) on each rep's user record.
4. Check **Hierarchy Table Management**: "all system tables are enabled for hierarchy security by default." Account and Contact are system tables. **The page doesn't say whether custom tables (`Lead`, `Opportunity`) are listed or ticked by default.** Check that they appear and are ticked after the tables are created.
5. Business unit rule: "a manager must be within the same business unit as the report, or in the parent business unit." With one root BU this is met automatically.
6. Changing the setting requires System Administrator, or the **Change Hierarchy Security Settings** privilege.

**Trade-offs**
- This is the only native feature that expresses "the owner's manager can edit, other people can't". It follows reporting lines automatically when the Manager field changes.
- Manager vs position model: position is only worth using if the person approving edits isn't the person on the user's Manager field, or if access must cross business units. For one team, the manager model is simpler because the Manager field may already come from Entra/HR data.
- Performance guidance: "Keep the effective hierarchy security to 50 users or less under a manager or position." This isn't a concern for one small team. Turning the model on or off "can take time because the system needs to recompute manager record access."
- Disabled users: managers see the records of disabled direct reports only in environments that enabled hierarchy after 31 Jan 2024, or via `AuthorizationEnableHSMForDisabledUsers`.
- Microsoft's positioning: "Use to support immediate managers in chains above individual granular access. Not intended to replace business unit access at more senior or broad scope levels." — https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-ce

**2.3 Conflict between Microsoft pages (test this)**
- The hierarchy security page says "a manager must have at least the user level Read privilege on a table, to see the reports' data." — https://learn.microsoft.com/en-us/power-platform/admin/hierarchy-security
- *How access to a record is determined* says that for hierarchy access "The manager has a security role assigned directly or through a team that has the access level Business Unit or Parent:Child Business Units." — https://learn.microsoft.com/en-us/power-platform/admin/how-record-access-determined
- Under the recommended role, the manager holds Organization Read and User Write. The pages don't say whether that satisfies the second wording, or whether hierarchy Write depends on the manager's own Write level. **Verify with three test users:** a manager, a report, and a non-report. Check that the manager can update the report's Lead/Opportunity and can't update the non-report's. If it fails, give the manager role Business Unit-level Write. In a single-BU org that is the same as the fallback in 2.4.

**Licences:** the hierarchy page states no extra licence. It's a platform feature of Dataverse environments, covered by the same Dataverse licence as (a). No Dynamics 365 licence is mentioned.

### (c) Business units and teams

**Business units**
- "Users can securely access data in their own business unit, but they can't access data in other business units unless they're assigned a security role from that business unit." Every user belongs to exactly one BU, and new users go into the root BU. — https://learn.microsoft.com/en-us/power-platform/admin/create-edit-business-units
- With a BU per manager plus BU-level Write, a manager could edit everything in their BU. But reps in that BU would also get BU-level Write from the same role, so you'd need separate rep and manager roles. Either way it is coarser than "owner or owner's manager".
- Microsoft's advice: "minimize the number of business units … Base them on access control requirements instead of mapping the organizational chart." — https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-ce. Also: "Avoid creating a large number of business units. Instead, create fewer business units and add hierarchy security." — https://learn.microsoft.com/en-us/power-platform/admin/hierarchy-security
- **Verdict:** not needed for one sales team. Keep the root BU.

**Owner teams / Entra group teams**
- "An owner team owns records and has security roles assigned to the team… A team has full access rights on the records that the team owns." Entra group teams work the same way, with members taken from the Entra group. — https://learn.microsoft.com/en-us/power-platform/admin/manage-teams
- Useful for **assigning the role** through one Entra security group instead of user by user. Example: an Entra group team "Sales" holding the Salesperson role. "Users who have the appropriate license and are added to the Microsoft Entra group are automatically enabled in the system and added to the team." — https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-ce
- Watch the team's **member privilege inheritance** setting. With "Team privileges only", User-level privileges apply only to records the team owns, so "owner edits" would break for user-owned records. Use "Direct User (Basic) access level and Team privileges". — https://learn.microsoft.com/en-us/power-platform/admin/security-roles-privileges, https://learn.microsoft.com/en-us/power-platform/admin/how-record-access-determined
- Making records team-owned (for example a team per rep plus their manager) would also express the rule. It's clumsy: one team per rep, and ownership no longer means "the salesperson".

**Access teams and sharing**
- "Access teams provide access to shared records but don't own records or have security roles." — https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds
- They suit exceptions such as "this colleague may co-edit this one opportunity". Microsoft: "Sharing should be seen as a way for users to manually manage exceptions … Don't automate sharing." — https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/security-strategy-product-ce
- **Verdict:** don't use them as the base model. They might be useful later for co-ownership of a deal.

**Licences:** standard Dataverse. Entra group teams need users to hold "the appropriate license".

### 2.4 Other options

- **Separate "Sales Manager" role with Organization-level Write.** Roles add up, so the manager can edit everything — https://learn.microsoft.com/en-us/power-platform/admin/security-roles-privileges. For one team with one manager this is nearly the same as hierarchy security with no hierarchy setup. It's broader in principle, and it doesn't follow the Manager field. It's a good fallback if 2.3 fails or if managers should edit all records anyway.
- **Column-level security** works on columns, not ownership. "Column-level security doesn't grant access to a record." It's for locking specific columns, such as the Opportunity value after it closes, not for this rule. — https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds
- **Filtered record ownership (preview)** uses row-level rules from FetchXML filters. Records "can't be owned by an individual" or shared, it's "not meant for production use", and the ownership type can't be changed after a table is created. Its FAQ says record filters can also be added to existing user- or organization-owned tables, but every example is a static column value. Nothing shows a filter that resolves to "the current user's own records", so it doesn't fit an owner-based rule. — https://learn.microsoft.com/en-us/power-apps/maker/data-platform/filtered-view-record-ownership
- **Checking only in the front end** (code app hides the Edit button) isn't security. A user with User-level Write could still change records through the Web API. Keep the Dataverse role as the enforcement point and use the UI only for convenience. *Inference:* the code apps docs don't say whose identity Dataverse calls run under (https://learn.microsoft.com/en-us/power-apps/developer/code-apps/architecture). Dataverse security applies per user ("the user must have an appropriate Dataverse license", https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds). Confirm in the test from 2.3 by calling as each test user.

## 3. Licensing summary

- **Running the code app:** "End users that run code apps need one of the following: Power Apps Premium license; Pay-as-you-go enabled; An App Pass; Auto-claim enabled." — https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview
- **Dataverse access:** "Accessing an environment with Dataverse requires all users to have a corresponding standalone Power Platform license… a user accessing an app running on Dataverse needs to be licensed by either the Power Apps per app or per user plan." Microsoft 365 seeded rights are not enough: "A standalone Power Apps … plan is still needed to run apps/flows/bots with Dataverse." — https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq
- **No Dynamics 365 licence needed.** Restricted tables "require … a license for the corresponding Dynamics 365 app if they need to create, update, or delete rows". Account and Contact aren't on that list, and custom `Lead`/`Opportunity` tables aren't D365 tables. — https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-restricted-entities
- **No extra licence for any security feature** in this document. Security roles, hierarchy security, BUs and teams have no licence statement beyond the Dataverse licence. The hierarchy page names none, and the security concepts page only requires "an appropriate Dataverse license".

## 4. Code-app caveats found along the way

- The code apps Dataverse guide says to leave `ownerid` out on create, so the caller becomes the owner. It lists **polymorphic lookups as not yet supported**, and `ownerid` is polymorphic (user or team). Reassigning a record (Assign) from the code app may therefore need a workaround or a later SDK version. Check this before building a "reassign owner" feature. — https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse
- The same page says lookups currently need the single-valued navigation property pattern. That applies to the Opportunity → Account link, which needs Append/Append To as set in (a).

## 5. Open questions to verify in a dev environment

1. Do custom tables `Lead` and `Opportunity` appear and stay ticked in **Hierarchy Table Management**? The docs only cover system tables.
2. Does hierarchy Write work when the manager's role has Organization Read and User Write? This is the conflict in 2.3.
3. Do the user-level role and hierarchy access hold when the code app calls Dataverse as each test user?
