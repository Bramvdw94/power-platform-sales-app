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
The step that closes a Lead with no deal, because it will not lead to a sale.
_Avoid_: Reject, delete

**Opportunity**:
A qualified deal with an expected value and close date, which moves through stages until it is won or lost.
_Avoid_: Deal, sale, prospect

**Pipeline**:
All open Opportunities, viewed by stage.
_Avoid_: Funnel

### People

**Owner**:
The salesperson responsible for a record; the owner and the owner's manager may change it, everyone else may only read it.
_Avoid_: Assignee, rep
