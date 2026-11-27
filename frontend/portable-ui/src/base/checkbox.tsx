"use client"

import * as React from "react"
import { cn } from "../lib/utils"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { useFieldControl } from "./field-context"

const BOX =
  "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-[background-color,border-color,box-shadow,scale] duration-150 outline-none active:scale-90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 aria-invalid:focus-visible:ring-destructive/35 dark:data-[state=checked]:bg-primary"

/** The tick (or, for a wrong answer, a cross). Each stroke draws itself in and out (styles.css, Motion). */
function Tick({ cross = false, className }: { cross?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-3.5 fill-none stroke-current stroke-[3] [stroke-linecap:round] [stroke-linejoin:round]", className)}>
      {cross
        ? <><path data-slot="checkbox-tick" pathLength={1} d="M7 7l10 10" /><path data-slot="checkbox-tick" pathLength={1} d="M17 7L7 17" /></>
        : <path data-slot="checkbox-tick" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />}
    </svg>
  )
}

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  // Custom: inside a Field or FieldCheck, its id and description come from it (field-context.ts).
  const wired = useFieldControl(props)
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(BOX, className)}
      {...wired}
    >
      {/* Custom: always mounted, so the tick can draw itself in and out (styles.css, Motion). */}
      <CheckboxPrimitive.Indicator
        forceMount
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <Tick />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

/**
 * Custom: the checkbox's look without its control, for a row that is itself the control (an
 * answer option). With `morph`, what it shows unchecked (a letter) shrinks away as it fills and the
 * tick draws in, and back. `tone` marks a checked answer right (green tick) or wrong (red cross).
 */
function CheckboxMark({
  checked,
  morph,
  tone,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { checked: boolean; morph?: React.ReactNode; tone?: "ok" | "bad" }) {
  return (
    <span
      data-slot="checkbox"
      data-state={checked ? "checked" : "unchecked"}
      data-tone={tone}
      aria-hidden
      className={cn(
        BOX,
        "relative grid place-items-center",
        tone === "ok" && "data-[state=checked]:border-ok data-[state=checked]:bg-ok data-[state=checked]:text-white dark:data-[state=checked]:bg-ok",
        tone === "bad" && "data-[state=checked]:border-bad data-[state=checked]:bg-bad data-[state=checked]:text-white dark:data-[state=checked]:bg-bad",
        className
      )}
      {...props}
    >
      {morph !== undefined && <span data-slot="checkbox-morph">{morph}</span>}
      <span data-slot="checkbox-indicator" className="absolute inset-0 grid place-items-center">
        <Tick cross={tone === "bad"} className="size-[62%]" />
      </span>
    </span>
  )
}

export { Checkbox, CheckboxMark }
