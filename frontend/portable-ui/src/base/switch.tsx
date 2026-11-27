"use client"

import * as React from "react"
import { cn } from "../lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"
import { useFieldControl } from "./field-context"
import { landing, SPRINGS, Spring, useDrag, useSpring } from "../lib/motion"

// Custom: the knob is a spring. A press flips it from wherever it is; it can also be dragged
// along the track, or flicked, and lands on the side the drag's speed carries it to.
//
// It is drawn by hand each frame (switchLook): it never leaves the track (an overshooting spring is
// held at the end, the padding keeps it off the edge). Its shape follows where it is, not how fast
// it goes: a circle at either end, stretched and flattened the most half way across, leaning
// towards the side it is heading for.

/** At half way, how much longer it is, as a share of its size, and how much flatter. */
const MAX_STRETCH = 0.6
const MAX_FLATTEN = 0.26

/** Where the knob sits and its shape: its left (px into the track's inside), width and height.
 *  `p` is where it is (0 off, 1 on); `lean` which way it is heading (1 right, -1 left, 0 both), so
 *  it grows that way. */
export function switchLook(p: number, lean: number, inner: number, size: number) {
  const room = Math.max(0, inner - size)
  const t = Math.max(0, Math.min(1, p))
  const left = t * room
  // 0 at either end, 1 half way.
  const shape = Math.sin(Math.PI * t)
  const grow = shape * MAX_STRETCH * size
  const behind = grow * (1 - (1 + Math.max(-1, Math.min(1, lean))) / 2)
  const width = Math.min(inner, size + grow)
  const x = Math.max(0, Math.min(inner - width, left - behind))
  return { x, width, height: size * (1 - shape * MAX_FLATTEN) }
}

function Switch({
  className,
  size = "default",
  onPointerDown,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  // Custom: inside a Field or FieldCheck, its id and description come from it (field-context.ts).
  const wired = useFieldControl(props)
  const root = React.useRef<HTMLButtonElement>(null)
  const thumb = React.useRef<HTMLSpanElement>(null)
  const draw = () => {
    const el = thumb.current
    const track = root.current
    if (!el || !track) return
    const pad = 2
    const inner = Math.max(0, track.clientWidth - pad * 2)
    const base = Math.max(0, track.clientHeight - pad * 2)
    const look = switchLook(knob.value, lean.value, inner, base)
    el.style.setProperty("--switch-x", `${look.x.toFixed(2)}px`)
    el.style.setProperty("--switch-w", `${look.width.toFixed(2)}px`)
    el.style.setProperty("--switch-h", `${look.height.toFixed(2)}px`)
  }
  // Which way it leans (-1 left, 1 right), eased on a quick spring so turning round mid-way does
  // not jump.
  const [lean] = React.useState(() => new Spring(1, () => draw(), SPRINGS.pop))
  const last = React.useRef<number | null>(null)
  const room = () => Math.max(1, (root.current?.clientWidth ?? 32) - (root.current?.clientHeight ?? 18))
  const knob = useSpring(props.checked ?? props.defaultChecked ? 1 : 0, (v) => {
    const was = last.current
    last.current = v
    if (was !== null && Math.abs(v - was) > 1e-4) {
      const heading = v > was ? 1 : -1
      if (lean.target !== heading) lean.to(heading, { gesture: true })
    }
    draw()
  })
  const on = () => root.current?.dataset.state === "checked"
  // Follows the state however it changes (a press, the keyboard, a parent), from where the knob is.
  React.useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    knob.jump(on() ? 1 : 0)
    last.current = knob.value
    lean.jump(on() ? -1 : 1)
    draw()
    const watch = new MutationObserver(() => { if (!knob.held) knob.to(on() ? 1 : 0) })
    watch.observe(el, { attributes: true, attributeFilter: ["data-state"] })
    return () => { watch.disconnect(); lean.stop() }
  }, [knob]) // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useDrag({
    axis: "x",
    threshold: 3,
    onStart: () => { if (props.disabled) return false },
    onMove: (offset) => {
      knob.set(Math.max(0, Math.min(1, (on() ? 1 : 0) + offset / room())))
    },
    onEnd: (offset, velocity) => {
      const p = Math.max(0, Math.min(1, (on() ? 1 : 0) + offset / room()))
      const v = velocity / room()
      const end = landing(p, v, [0, 1])
      knob.to(end, { velocity: v })
      // After the drag's own click has been swallowed (lib/motion), so this one counts.
      if ((end === 1) !== on()) setTimeout(() => root.current?.click(), 0)
    },
  })
  return (
    <SwitchPrimitive.Root
      ref={root}
      data-slot="switch"
      data-size={size}
      onPointerDown={(e) => { onPointerDown?.(e); drag.onPointerDown(e) }}
      className={cn(
        // The track: padded so the knob never touches (or leaves) its edge, with an inset shadow.
        "peer group/switch relative inline-flex shrink-0 items-center overflow-hidden rounded-full p-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.22)] transition-[color,background-color,box-shadow] outline-none touch-pan-y focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80 select-none [-webkit-touch-callout:none]",
        className
      )}
      {...wired}
    >
      <SwitchPrimitive.Thumb
        ref={thumb}
        data-slot="switch-thumb"
        className={cn(
          // Drawn by switchLook: where it is and its shape. A drop shadow and a hairline keep it
          // apart from the track, light or dark.
          "pointer-events-none absolute top-1/2 left-[2px] block translate-x-[var(--switch-x,0px)] -translate-y-1/2 rounded-full bg-background shadow-[0_1px_3px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(0,0,0,0.12)] ring-0 group-data-[size=default]/switch:h-[var(--switch-h,calc(1.15rem_-_4px))] group-data-[size=default]/switch:w-[var(--switch-w,calc(1.15rem_-_4px))] group-data-[size=sm]/switch:h-[var(--switch-h,calc(0.875rem_-_4px))] group-data-[size=sm]/switch:w-[var(--switch-w,calc(0.875rem_-_4px))] dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
