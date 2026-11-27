import * as React from "react"
import { cn } from "../lib/utils"
import { useFieldControl } from "./field-context"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  // Custom: inside a Field, its id and description come from the Field (field-context.ts).
  const wired = useFieldControl(props)
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 aria-invalid:focus-visible:ring-destructive/35",
        className
      )}
      {...wired}
    />
  )
}

export { Textarea }
