import * as React from "react"

import { cn } from "@/lib/utils"

type SwitchProps = Omit<React.ComponentProps<"button">, "onChange" | "role" | "type"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/** An on/off switch. The accessible name comes from aria-label or aria-labelledby. */
function Switch({ checked, onCheckedChange, className, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      data-slot="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "group inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-primary dark:bg-input/80 dark:aria-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn("pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform dark:bg-foreground dark:group-aria-checked:bg-background", checked ? "translate-x-[1.125rem]" : "translate-x-0.5")}
      />
    </button>
  )
}

export { Switch }
