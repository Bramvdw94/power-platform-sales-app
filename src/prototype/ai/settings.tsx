// PROTOTYPE (throwaway, never merge): the AI assist settings for System Administrators (#166).
// A = stacked cards, B = Settings | Usage log tabs, C = usage tiles on top.

import { useState } from "react"
import { Check, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { aiActions, isAdminViewer, useAiState } from "./store"
import { useProtoVariant } from "./switcher"

const euro = (n: number, digits = 2) => `€${n.toFixed(digits)}`

function ago(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}

function SettingsCard() {
  const s = useAiState()
  const admin = isAdminViewer(s)
  const [daily, setDaily] = useState(String(s.dailyLimit))
  const [cap, setCap] = useState(String(s.monthlyCap))
  const [saved, setSaved] = useState(false)
  const dailyNum = Number(daily)
  const capNum = Number(cap)
  const dailyError = !Number.isInteger(dailyNum) || dailyNum < 1 ? "Enter a whole number of at least 1." : undefined
  const capError = !(capNum > 0) ? "Enter an amount above 0." : undefined
  const dirty = dailyNum !== s.dailyLimit || capNum !== s.monthlyCap

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>AI assist</CardTitle>
        <CardDescription>
          Timeline summaries, follow-up drafts and Next step suggestions. They run only when someone presses a button.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-4">
        {!admin && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">Only System Administrators can change these settings. You are looking at them read-only.</p>
        )}
        <div className="flex items-start gap-3">
          <Switch id="ai-enabled" aria-labelledby="ai-enabled-label" checked={s.enabled} disabled={!admin} onCheckedChange={(enabled) => aiActions.set({ enabled })} className="mt-0.5" />
          <div>
            <Label id="ai-enabled-label" htmlFor="ai-enabled">
              AI assist is {s.enabled ? "on" : "off"}
            </Label>
            <p className="text-sm text-muted-foreground">When it is off the buttons stay in place, disabled, with the reason next to them.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ai-daily">Daily limit per person</Label>
            <Input id="ai-daily" type="number" min={1} inputMode="numeric" value={daily} disabled={!admin} aria-invalid={dailyError ? true : undefined} onChange={(e) => { setDaily(e.target.value); setSaved(false) }} />
            <p className="text-xs text-muted-foreground">Requests per person per day. Regenerate counts. Default 50.</p>
            {dailyError && <p className="text-sm text-destructive">{dailyError}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-cap">Monthly team cap (€)</Label>
            <Input id="ai-cap" type="number" min={0} step="0.5" inputMode="decimal" value={cap} disabled={!admin} aria-invalid={capError ? true : undefined} onChange={(e) => { setCap(e.target.value); setSaved(false) }} />
            <p className="text-xs text-muted-foreground">On top of the cap set at the model provider. Default €5.</p>
            {capError && <p className="text-sm text-destructive">{capError}</p>}
          </div>
        </div>
        {admin && (
          <div className="flex items-center gap-3">
            <Button
              disabled={!dirty || !!dailyError || !!capError}
              onClick={() => {
                aiActions.set({ dailyLimit: dailyNum, monthlyCap: capNum })
                setSaved(true)
              }}
            >
              Save
            </Button>
            {saved && (
              <span role="status" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="size-4" aria-hidden />
                Saved
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Meter({ label, value, max, text, detail }: { label: string; value: number; max: number; text: string; detail: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm tabular-nums">{text}</p>
      </div>
      <Progress value={pct} aria-label={label} className={cn(pct >= 100 && "bg-destructive/20 [&>div]:bg-destructive")} />
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function Meters({ tiles }: { tiles?: boolean }) {
  const s = useAiState()
  const team = s.log.filter((e) => Date.now() - new Date(e.when).getTime() < 86_400_000).length
  const meters = [
    <Meter key="me" label="Your requests today" value={s.usedToday} max={s.dailyLimit} text={`${s.usedToday} of ${s.dailyLimit}`} detail="Resets at midnight." />,
    <Meter key="team" label="Team spend this month" value={s.spent} max={s.monthlyCap} text={`${euro(s.spent)} of ${euro(s.monthlyCap)}`} detail="Resets on 1 November." />,
    ...(tiles
      ? [<Meter key="all" label="Team requests, last 24 hours" value={team} max={Math.max(team, 20)} text={`${team}`} detail="Across everyone who used AI assist." />]
      : []),
  ]
  return tiles ? (
    <div className="grid gap-4 md:grid-cols-3">
      {meters.map((meter) => (
        <Card key={meter.key} className="gap-0 py-4">
          <CardContent className="px-4">{meter}</CardContent>
        </Card>
      ))}
    </div>
  ) : (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>Usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">{meters}</CardContent>
    </Card>
  )
}

function UsageLog() {
  const s = useAiState()
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>Usage log</CardTitle>
        <CardDescription>Who asked for what, on which record, with tokens and cost. The text sent and received is never stored.</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="divide-y md:hidden" aria-label="Usage log">
          {s.log.slice(0, 12).map((e) => (
            <li key={e.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{e.kind}</Badge>
                <span className="text-sm text-muted-foreground">{ago(e.when)}</span>
              </div>
              <p className="text-sm break-words">{e.record}</p>
              <p className="text-xs text-muted-foreground">
                {e.who} · {e.tokens.toLocaleString("en-GB")} tokens · €{e.cost.toFixed(4)}
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Record</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.log.slice(0, 12).map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{ago(e.when)}</TableCell>
                <TableCell className="whitespace-nowrap">{e.who}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="whitespace-nowrap">
                    {e.kind}
                  </Badge>
                </TableCell>
                <TableCell>{e.record}</TableCell>
                <TableCell className="text-right tabular-nums">{e.tokens.toLocaleString("en-GB")}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">€{e.cost.toFixed(4)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export function AiSettingsPage() {
  const variant = useProtoVariant()
  const s = useAiState()
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles className="size-5 text-violet-700 dark:text-violet-300" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">AI assist</h1>
        <Badge variant={s.enabled ? "secondary" : "outline"}>{s.enabled ? "On" : "Off"}</Badge>
      </div>
      {variant === "A" && (
        <>
          <SettingsCard />
          <Meters />
          <UsageLog />
        </>
      )}
      {variant === "B" && (
        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="usage">Usage log</TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="space-y-4">
            <SettingsCard />
          </TabsContent>
          <TabsContent value="usage" className="space-y-4">
            <Meters />
            <UsageLog />
          </TabsContent>
        </Tabs>
      )}
      {variant === "C" && (
        <>
          <Meters tiles />
          <SettingsCard />
          <UsageLog />
        </>
      )}
    </div>
  )
}
