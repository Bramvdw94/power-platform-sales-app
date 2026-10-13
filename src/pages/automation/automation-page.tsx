import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProcessesTab } from "./processes-tab"
import { RulesTab } from "./rules-tab"

/** Automation: where Processes and Business rules are built by a Process builder and read by everyone. */
export default function AutomationPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Automation</h1>
      <Tabs defaultValue="processes" className="gap-4">
        <TabsList>
          <TabsTrigger value="processes">Processes</TabsTrigger>
          <TabsTrigger value="rules">Business rules</TabsTrigger>
        </TabsList>
        <TabsContent value="processes">
          <ProcessesTab />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
