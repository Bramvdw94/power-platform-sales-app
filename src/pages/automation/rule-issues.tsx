import type { PublishIssue } from "@/sales/engine"

export function IssueList({ issues, tone }: { issues: PublishIssue[]; tone: "error" | "warning" }) {
  if (issues.length === 0) return null
  return (
    <ul
      role={tone === "error" ? "alert" : "status"}
      aria-label={tone === "error" ? "Why this rule can't be saved" : "Worth knowing"}
      className={
        tone === "error"
          ? "list-disc space-y-0.5 rounded-md border border-destructive/40 bg-destructive/10 py-2 pr-3 pl-7 text-sm text-destructive"
          : "list-disc space-y-0.5 rounded-md border border-amber-600/50 bg-amber-500/10 py-2 pr-3 pl-7 text-sm text-amber-900 dark:border-amber-400/50 dark:text-amber-200"
      }
    >
      {issues.map((issue, index) => (
        <li key={index}>{issue.message}</li>
      ))}
    </ul>
  )
}

export function PublishIssuesAlert({ issues }: { issues: PublishIssue[] }) {
  return <IssueList issues={issues} tone="error" />
}
