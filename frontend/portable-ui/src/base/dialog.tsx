"use client"

import * as React from "react"
import { cn } from "../lib/utils"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { landing, usePresence, useDrag, useSpring, type Spring } from "../lib/motion"

import { Button } from "./button"

// Custom: a dialog grows in and fades on a spring (lib/motion), and turns round from where it is
// when closed mid-way. On a touch screen it can be dragged down by its top edge (a grab strip there): let go, and how fast it was going
// decides whether it leaves or springs back.
interface DialogMotion {
  spring: Spring
  drag: Spring
  setOpen(open: boolean): void
  content: React.RefObject<HTMLDivElement | null>
  overlay: React.RefObject<HTMLDivElement | null>
}
const DialogMotionContext = React.createContext<DialogMotion | null>(null)

function Dialog({ open: openProp, defaultOpen, onOpenChange, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [own, setOwn] = React.useState(defaultOpen ?? false)
  const open = openProp ?? own
  const setOpen = React.useCallback((next: boolean) => { if (openProp === undefined) setOwn(next); onOpenChange?.(next) }, [openProp, onOpenChange])
  const content = React.useRef<HTMLDivElement | null>(null)
  const overlay = React.useRef<HTMLDivElement | null>(null)
  const drive = (p: number) => {
    const el = content.current
    if (el) { el.style.opacity = String(Math.max(0, Math.min(1, p))); el.style.scale = String(0.94 + 0.06 * p) }
    overlay.current?.style.setProperty("opacity", String(Math.max(0, Math.min(1, p))))
  }
  const { present, spring } = usePresence(open, drive)
  const drag = useSpring(0, (y) => content.current?.style.setProperty("--dialog-drag", `${y}px`))
  React.useEffect(() => { if (open) drag.jump(0) }, [open, drag])
  const motion = React.useMemo(() => ({ spring, drag, setOpen, content, overlay }), [spring, drag, setOpen])
  return (
    <DialogMotionContext.Provider value={motion}>
      <DialogPrimitive.Root data-slot="dialog" open={present} onOpenChange={setOpen} {...props}>{children}</DialogPrimitive.Root>
    </DialogMotionContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

// The portal hands its children a ref of its own (Radix clones them through a Slot). Here that ref
// arrives as a prop, so it is called alongside the dialog's: spread after it, it would replace it,
// the overlay would never be driven, and its backdrop would stay at opacity 0 (16 Nov).
function DialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const motion = React.useContext(DialogMotionContext)
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
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

/** Full screen on a phone, its top clear of the notch (search, "search should be full
 *  screen"); a card as before everywhere else. Important, so a dialog's own placing (`top-[12vh]`,
 *  `sm:max-w-xl` on a phone held sideways) does not undo it. */
const FULL_ON_PHONE =
  "phone:inset-0! phone:top-0! phone:left-0! phone:h-dvh! phone:max-h-none! phone:w-full! phone:max-w-none! phone:translate-x-0! phone:translate-y-[var(--dialog-drag,0px)]! phone:rounded-none! phone:border-0! phone:pt-[env(safe-area-inset-top)]!"

function DialogContent({
  className,
  children,
  showCloseButton = true,
  fullOnPhone = false,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Fill the screen on a phone (its drag handle hidden: it would sit over the dialog's first row). */
  fullOnPhone?: boolean
}) {
  const motion = React.useContext(DialogMotionContext)
  const DISTANCE = 320
  const drag = useDrag({
    axis: "y",
    ignore: "input, textarea, select, button, a, [data-no-drag], [contenteditable]",
    onStart: (e) => { if (!motion || e.pointerType !== "touch") return false },
    onMove: (offset) => {
      if (!motion) return
      // Down it follows the finger and fades; up, it gives a little and no more.
      const y = offset > 0 ? offset : offset * 0.15
      motion.drag.set(y)
      motion.spring.set(1 - Math.max(0, y) / DISTANCE)
    },
    onEnd: (offset, velocity) => {
      if (!motion) return
      const y = Math.max(0, offset)
      if (landing(y, velocity, [0, DISTANCE]) === DISTANCE) {
        motion.drag.to(y + Math.max(0, velocity) * 0.15, { velocity })
        motion.spring.velocity = -velocity / DISTANCE
        motion.setOpen(false)
      } else {
        motion.drag.to(0, { velocity })
        motion.spring.to(1, { velocity: -velocity / DISTANCE })
      }
    },
  })
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-full-on-phone={fullOnPhone || undefined}
        // Drawn where the spring is as it attaches (it can arrive after a reduced-motion jump).
        ref={(el) => {
          if (!motion) return
          motion.content.current = el
          if (el) { const p = Math.max(0, Math.min(1, motion.spring.value)); el.style.opacity = String(p); el.style.scale = String(0.94 + 0.06 * p) }
        }}
        style={{ opacity: motion?.spring.value ?? 1, scale: String(0.94 + 0.06 * (motion?.spring.value ?? 1)), ...style }}
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[calc(-50%+var(--dialog-drag,0px))] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none sm:max-w-lg",
          className,
          fullOnPhone && FULL_ON_PHONE
        )}
        {...props}
      >
        {motion && (
          <div aria-hidden data-slot="dialog-grab" onPointerDown={drag.onPointerDown}
            className={cn("absolute inset-x-12 top-0 hidden h-6 touch-none pointer-coarse:block", fullOnPhone && "phone:hidden!")}>
            <span className="mx-auto mt-2 block h-1 w-9 rounded-full bg-border" />
          </div>
        )}
        {children}
        {/* Custom: the close button is a Button, so it looks, focuses and presses like every other. */}
        {showCloseButton && (
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
