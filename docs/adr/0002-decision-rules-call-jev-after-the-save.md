# Decision rules call Jev after the save, with the key in the plug-in's secure configuration

Decision rules ask Jev, an outside decision model, a question about a record. ADR 0001 runs every Action synchronously inside the save transaction, but an outside call there would make the user wait on someone else's service and would roll back or block a save whenever Jev is slow or down. Decision rules also fire on records nobody is waiting on: web Leads and logged incoming Emails.

We decided:

- **After the save**: the synchronous step of the generic plug-in only notices that a Decision rule applies and writes a pending Decision log row. A separate asynchronous PostOperation step of the same plug-in package builds the input, calls Jev, stores the Decision and runs the Actions for the answer as the system. A Decision rule never blocks or rolls back a save.
- **Failures are visible, not silent**: every call leaves a Decision log row (Pending, Done, Needs review, Failed). A failed call becomes an Engine error for Process builders and puts the record in Needs review for its Owner, which answers ADR 0001's worry that asynchronous Actions fail silently.
- **The key**: the Jev API key sits in the asynchronous step's secure configuration, which only system administrators can read and which is not exported with the solution. It never reaches the code app.
- **Only reversible Actions and a spend cap**: because Jev reads untrusted text from forms and emails, a Decision rule may only set a field, assign an Owner, create a Task or notify, and daily and monthly caps pause rules before the prepaid balance runs out.
- **The app engine cannot evaluate a Decision rule**: the TypeScript engine shows a Decision as pending until it arrives. Decision rules are not part of the shared deterministic JSON test cases; each rule is checked with Try instead.

## Considered options

- **Synchronous call inside the save**: the user waits, and a Jev outage blocks creating Leads.
- **A Power Automate flow with the HTTP action**: needs Power Automate Premium or a Process licence for a Dataverse trigger outside app context.
- **Calling Jev from the code app**: exposes the key in the browser, and web Leads and emails arrive without the app open.
- **A secret environment variable**: requires Azure Key Vault, which the no-paid-Azure rule excludes.

Decided in [What a Decision rule is and how a manager configures it](https://github.com/Bramvdw94/power-platform-sales-app/issues/143), from the research in [How the process engine can call the Jev decision model cheaply and safely](https://github.com/Bramvdw94/power-platform-sales-app/issues/134).
