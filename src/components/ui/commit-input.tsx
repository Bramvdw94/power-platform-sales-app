import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/** A text input that keeps what is typed locally and hands it over when the user leaves it (or presses Enter). */
export function CommitInput({ value, onCommit, ...props }: { value: string; onCommit: (value: string) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange" | "onBlur">) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => text !== value && onCommit(text)
  return (
    <Input
      {...props}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
      }}
    />
  )
}

export function CommitTextarea({ value, onCommit, ...props }: { value: string; onCommit: (value: string) => void } & Omit<React.ComponentProps<"textarea">, "value" | "onChange" | "onBlur">) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return <Textarea {...props} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onCommit(text)} />
}
