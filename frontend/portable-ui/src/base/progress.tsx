"use client"

import * as React from "react"
import { cn } from "../lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"
import { useSpring } from "../lib/motion"

// Custom: the fill moves to a new value on a spring (lib/motion), from wherever it is, instead
// of a CSS transition; it is drawn at its value on the first frame.
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const fill = React.useRef<HTMLDivElement>(null)
  const draw = (v: number) => { if (fill.current) fill.current.style.transform = `translateX(-${100 - Math.max(0, Math.min(100, v))}%)` }
  const spring = useSpring(value || 0, draw)
  React.useEffect(() => { spring.to(value || 0) }, [spring, value])
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      // Custom: the value goes to Radix too, so the bar says it (aria-valuenow); null is indeterminate.
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        ref={(el) => { fill.current = el; if (el) draw(spring.value) }}
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary"
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
