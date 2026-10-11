# Process engine: definitions as data, enforced by one generic plug-in, mirrored in the app

Managers build Processes and Business rules in the app, so they must be data, not Dataverse customisations. Native business process flows and business rules can only be authored in Microsoft's designers, and low-code Power Fx plug-ins are still preview. A rule that only the code app checks is bypassed by any Web API call, import or flow.

We decided:

- **Storage**: each Process and Business rule is one row with its definition (Steps, Gates, Actions, conditions) in a schema-checked JSON column. Publish writes an immutable version row. A Lead or Opportunity carries its Process version, current Step and Step-entered date in its own columns, not in a separate instance table.
- **Enforcement**: one generic C# plug-in (plug-in package in `plugins/`, registered in the SalesApp solution) runs synchronously on Lead, Opportunity, Account and Contact. It picks the Process at creation, checks Gates on a Step move, sets Stage from Step, applies required, read-only, block save and set value, checks who may Switch Process, and runs Actions after the save in the same transaction. There is no custom API: the app writes the new Step and the plug-in does the rest. It checks the caller's own rights for the save, but reads definitions and creates Action Tasks as the system.
- **In the app**: a pure TypeScript engine evaluates the same definitions for instant feedback. Warnings, Key fields and Guidance live only there. The gateway loads published definitions, and the in-memory twin implements them too.
- **Two engines, one behaviour**: the TypeScript and C# engines run one shared set of JSON test cases.
- **Bulk loads**: rules apply to imports too; the sample-data script and admins skip custom plug-ins through Dataverse's bypass option.

## Considered options

- **Code app only**: simplest, but not a guarantee for any other client.
- **Custom API for Step moves**: a second path that would need the Step column locked against direct writes.
- **Asynchronous Actions**: a Task would appear late and a failure would be silent.
- **A table per Step, Gate check and Action**: dozens of writes per edit and a harder draft and publish.
- **Running the TypeScript engine inside the plug-in through a .NET JavaScript interpreter**: one engine, but slower, unusual and harder to debug.

Decided in [Where processes and rules execute and how definitions are stored](https://github.com/Bramvdw94/power-platform-sales-app/issues/66).
