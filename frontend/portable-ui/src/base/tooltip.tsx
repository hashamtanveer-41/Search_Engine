"use client"

import * as React from "react"
import { cn } from "../lib/utils"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { PopContext, usePopRoot } from "../lib/motion"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({ open, defaultOpen, onOpenChange, ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  // Custom: opens and closes on a spring (lib/motion), turning round from where it is.
  const { present, setOpen, pop } = usePopRoot(open, defaultOpen, onOpenChange)
  return <PopContext.Provider value={pop}><TooltipPrimitive.Root data-slot="tooltip" open={present} onOpenChange={setOpen} {...props} /></PopContext.Provider>
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  style,
  tone,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  /** Custom: `bad` for what is about to destroy something (a delete waiting for its second
   *  press), red, its arrow too. */
  tone?: "bad"
}) {
  const pop = React.useContext(PopContext)
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        ref={pop?.ref}
        style={{ ...pop?.style, ...style }}
        sideOffset={sideOffset}
        data-tone={tone}
        className={cn(
          "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background",
          // White on red; a deeper red in the dark theme, whose red is light.
          tone === "bad" && "bg-bad font-medium text-white dark:bg-[color-mix(in_srgb,var(--bad)_70%,black)]",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className={cn("z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground transition-[background-color,fill] duration-200", tone === "bad" && "bg-bad fill-bad dark:bg-[color-mix(in_srgb,var(--bad)_70%,black)] dark:fill-[color-mix(in_srgb,var(--bad)_70%,black)]")} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
