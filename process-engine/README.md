# Process engine: definitions and shared cases

Decided in [ADR 0001](../docs/adr/0001-process-engine-plugin-plus-app-evaluation.md).

- `schema/definition.schema.json` is the one JSON Schema for Process and Business rule definitions. Both engines read this shape. `#/definitions/processDefinition` is the draft and published Process definition; `#/definitions/businessRuleDefinition` is a Business rule.
- `cases/*.json` are the shared engine cases. The TypeScript engine (`src/sales/engine`) runs them in Vitest (`src/sales/engine/engine-cases.test.ts`). The C# plug-in's engine runs the same files in xUnit. A change to either engine lands with its cases.

## Case format

Every file is an array of cases. Each case has a unique `name`, `covers` (the decisions it pins down, as `#ticket.point`), a `type`, an `input` and an `expect`.

| type | input | expect |
| --- | --- | --- |
| `schema` | `kind` (`process` or `rule`), `definition` | `valid` |
| `condition` | `table`, `record`, `parents`, `related`, `group` | `holds` |
| `pick` | `table`, `record`, `parents`, `processes`, `versions` | `processId` (or null), optional `versionId` |
| `save` | a save: `table`, `before` (null on create), `change`, `caller`, `users`, `now`, `engineEnabled`, `processes`, `versions`, `rules`, `fields`, `parents`, `related` | subset of the outcome: `allowed`, `rejection` (`code`, `message`, `stepId`, `failedChecks`, `ruleIds`), `changes`, `tasks`; plus `taskCount`, `engineErrorCodes`, `warningMessages` |
| `publishProcess` | `definition`, `rules`, `fields` | `errorCodes`, `warningCodes` |
| `publishRule` | `rule`, `otherRules`, `processes`, `fields` | `errorCodes`, `warningCodes` |

How `expect` is compared for `save`: every key given must match the outcome (objects by the keys given, arrays by length and element); keys left out are not checked. `changes` is only what differs from the stored record. Every definition in a `save` case is also validated against the schema.

## Behaviour the cases pin down that is not spelled out in the tickets

- A Process that is not the fallback and has no Entry criteria never matches; only the fallback applies to everything.
- Actions also run when a record is created on a Step (it enters the first Step).
- A Stage or Lead status written directly (the Board's Stage picker) moves the record to the first Step mapped to it, through the Gate when that is forward.
- A reopened record keeps its Process version and lands on its old Step when it still maps to the chosen Stage or status, otherwise as with Switch Process.
- Block save with no conditions reads no field, so it only fires on create.

## Reading `covers`

`#64.5` is point 5 of the resolution on decision ticket #64 (also #65, #76, #88). A bare number such as `#53` is user story 53 in the v2 spec (#91). `#66` is ADR 0001.
