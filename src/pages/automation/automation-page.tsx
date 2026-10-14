import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProcessesTab } from "./processes-tab"
import { RulesTab } from "./rules-tab"
import { useSearchParams } from "react-router-dom"
import { DecisionRulesTab } from "@/prototype/decision/decision-rules-tab"

/** Automation: where Processes and Business rules are built by a Process builder and read by everyone. */
export default function AutomationPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") ?? "processes"
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Automation</h1>
      <Tabs value={tab} onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", v); return n })} className="gap-4">
        <TabsList>
          <TabsTrigger value="processes">Processes</TabsTrigger>
          <TabsTrigger value="rules">Business rules</TabsTrigger>
          <TabsTrigger value="decisions">Decision rules</TabsTrigger>
        </TabsList>
        <TabsContent value="processes">
          <ProcessesTab />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionRulesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
