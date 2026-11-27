"use client"

import * as React from "react"
import { cn } from "../lib/utils"
import { XIcon } from "lucide-react"
import { Button } from "./button"
import { Dialog as SheetPrimitive } from "radix-ui"
import { landing, usePresence, useDrag, type Spring } from "../lib/motion"

// Custom: the sheet moves on a spring (lib/motion), not a timed slide. It follows a finger that
// drags it toward its edge; let go and how fast it was going decides whether it closes or springs
// back, and at that speed. Opened or closed again mid-way, it turns round from where it is. With
// `edgeSwipe`, a drag in from that edge of the window pulls it open the same way.
type Side = "top" | "right" | "bottom" | "left"
interface SheetMotion {
  spring: Spring
  setOpen(open: boolean): void
  content: React.RefObject<HTMLDivElement | null>
  overlay: React.RefObject<HTMLDivElement | null>
  side: React.RefObject<Side>
}
const SheetMotionContext = React.createContext<SheetMotion | null>(null)

/** How far a sheet on `side` is pushed out, as a translate, at progress `p` (1 is open). */
export function sheetOffset(side: Side, p: number) {
  const out = `${((1 - p) * 100).toFixed(3)}%`
  const sign = side === "left" || side === "top" ? "-" : ""
  return side === "left" || side === "right" ? `${sign}${out} 0` : `0 ${sign}${out}`
}

function Sheet({ open: openProp, defaultOpen, onOpenChange, edgeSwipe, children, ...props }: React.ComponentProps<typeof SheetPrimitive.Root> & {
  /** Drag in from this edge of the window to pull the sheet open (a phone's navigation). */
  edgeSwipe?: "left" | "right"
}) {
  const [own, setOwn] = React.useState(defaultOpen ?? false)
  const open = openProp ?? own
  const setOpen = React.useCallback((next: boolean) => { if (openProp === undefined) setOwn(next); onOpenChange?.(next) }, [openProp, onOpenChange])
  const content = React.useRef<HTMLDivElement | null>(null)
  const overlay = React.useRef<HTMLDivElement | null>(null)
  const side = React.useRef<Side>(edgeSwipe ?? "right")
  const drive = (p: number) => {
    content.current?.style.setProperty("translate", sheetOffset(side.current, p))
    overlay.current?.style.setProperty("opacity", String(Math.max(0, Math.min(1, p))))
  }
  const { present, spring } = usePresence(open, drive)
  const motion = React.useMemo(() => ({ spring, setOpen, content, overlay, side }), [spring, setOpen])
  return (
    <SheetMotionContext.Provider value={motion}>
      <SheetPrimitive.Root data-slot="sheet" open={present} onOpenChange={setOpen} {...props}>
        {children}
      </SheetPrimitive.Root>
      {edgeSwipe && !open && <SheetEdge side={edgeSwipe} motion={motion} />}
    </SheetMotionContext.Provider>
  )
}

/** A thin strip along the window's edge: drag from it and the sheet comes out under the finger. */
function SheetEdge({ side, motion }: { side: "left" | "right"; motion: SheetMotion }) {
  const dir = side === "left" ? 1 : -1
  const width = React.useRef(280)
  const drag = useDrag({
    axis: "x",
    onStart: () => {
      motion.side.current = side
      motion.spring.set(0)
      motion.setOpen(true)
      width.current = Math.min(window.innerWidth * 0.85, 320)
    },
    onMove: (offset) => motion.spring.set(Math.max(0, Math.min(1, (offset * dir) / width.current))),
    onEnd: (offset, velocity) => {
      const p = Math.max(0, Math.min(1, (offset * dir) / width.current))
      const v = (velocity * dir) / width.current
      if (landing(p, v, [0, 1]) === 0) { motion.spring.velocity = v; motion.setOpen(false) }
      else motion.spring.to(1, { velocity: v })
    },
  })
  return (
    <div aria-hidden data-slot="sheet-edge" {...drag}
      // Below the top bar (h-11): over it, the strip took the left of the menu button.
      className={cn("fixed top-11 bottom-0 z-40 w-4 touch-pan-y roomy:hidden", side === "left" ? "left-0" : "right-0")} />
  )
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  const motion = React.useContext(SheetMotionContext)
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      ref={(el) => {
        if (motion) { motion.overlay.current = el; if (el) el.style.opacity = String(Math.max(0, Math.min(1, motion.spring.value))) }
        if (typeof ref === "function") ref(el); else if (ref) ref.current = el
      }}
      style={{ opacity: motion?.spring.value ?? 1 }}
      className={cn("fixed inset-0 z-50 bg-black/50", className)}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  style,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: Side
  showCloseButton?: boolean
}) {
  const motion = React.useContext(SheetMotionContext)
  if (motion) motion.side.current = side
  // Dragged toward its own edge it follows the finger; away from it, it gives a little and no more.
  const across = side === "left" || side === "right"
  const dir = side === "left" || side === "top" ? -1 : 1
  const size = () => (across ? motion?.content.current?.offsetWidth : motion?.content.current?.offsetHeight) || 1
  const progress = (offset: number) => {
    const out = (offset * dir) / size()
    return out >= 0 ? 1 - Math.min(1, out) : 1 + Math.min(0.03, -out * 0.1)
  }
  const drag = useDrag({
    axis: across ? "x" : "y",
    onStart: () => { if (!motion) return false },
    onMove: (offset) => motion?.spring.set(progress(offset)),
    onEnd: (offset, velocity) => {
      if (!motion) return
      const p = Math.min(1, progress(offset))
      const v = (-velocity * dir) / size()
      if (landing(p, v, [0, 1]) === 0) { motion.spring.velocity = v; motion.setOpen(false) }
      else motion.spring.to(1, { velocity: v })
    },
  })
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        // Drawn where the spring is as it attaches: it can arrive after the spring has already
        // jumped open (reduced motion jumps in one step), and would otherwise stay off-screen (16 Nov).
        ref={(el) => { if (motion) { motion.content.current = el; if (el) el.style.setProperty("translate", sheetOffset(side, motion.spring.value)) } }}
        onPointerDown={drag.onPointerDown}
        style={{ translate: sheetOffset(side, motion?.spring.value ?? 1), ...style }}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-background shadow-lg",
          across ? "touch-pan-y" : "touch-pan-x",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        {...props}
      >
        {children}
        {/* Custom: the close button is a Button, so it looks, focuses and presses like every other. */}
        {showCloseButton && (
          <SheetPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
