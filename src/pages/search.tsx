import { useState, type FormEvent } from "react"
import { useSearchParams } from "react-router-dom"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { PlaceholderPage } from "./placeholder"

/** Global search results; on a phone it is also where you type the search. */
export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get("q") ?? ""
  const [text, setText] = useState(query)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setParams(text.trim() ? { q: text.trim() } : {})
  }
  return (
    <PlaceholderPage title="Search" ticket="#28">
      <form role="search" onSubmit={submit} className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          key={query}
          aria-label="Search Leads, Opportunities, Accounts and Contacts"
          placeholder="Search Leads, Opportunities, Accounts and Contacts"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="pl-8"
        />
      </form>
      {query && <p className="text-sm">Results for “{query}”.</p>}
    </PlaceholderPage>
  )
}
