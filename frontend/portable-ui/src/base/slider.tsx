"use client"

// Slider (shadcn/ui's, on Radix), the library’s way: a thin track, a thumb that grows a little while
// it is held (scale: nothing moves), the soft focus ring, optional marks under the track and the
// value shown in a bubble above the thumb while it is held (from the thumb, or from anywhere on the
// track: the thumb jumps there and its bubble shows), dragged or focused. The slider never changes
// size as it is used: marks and bubble are drawn in space it always reserves.
import * as React from "react"
import { cn } from "../lib/utils"
import { Slider as SliderPrimitive } from "radix-ui"

export type SliderMark = number | { value: number; label?: React.ReactNode }

export interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /** Ticks under the track, optionally labelled. */
  marks?: SliderMark[]
  /** Show the value above the thumb while it is dragged or focused; a function formats it. */
  showValue?: boolean | ((value: number) => React.ReactNode)
  /** The track's fill and thumb colour. */
  tone?: "default" | "info" | "ok" | "warn" | "bad"
}

const TONE: Record<NonNullable<SliderProps["tone"]>, string> = {
  default: "var(--primary)", info: "var(--info)", ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)",
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  marks,
  showValue = false,
  tone = "default",
  onValueChange,
  onPointerDown,
  style,
  ...props
}: SliderProps) {
  const [inner, setInner] = React.useState(() => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]))
  const values = Array.isArray(value) ? value : inner
  // The bubble shows on the thumb that is focused, or the one a press anywhere on the slider moved.
  const [focused, setFocused] = React.useState<number | null>(null)
  const [pressed, setPressed] = React.useState<number | null>(null)
  const pressing = React.useRef(false)
  React.useEffect(() => {
    if (pressed === null) return
    const up = () => { pressing.current = false; setPressed(null) }
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up) }
  }, [pressed])
  /** The thumb nearest a value (the one Radix moves when the track is pressed). */
  const nearest = (v: number) => values.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(values[best] - v) ? i : best), 0)
  const format = typeof showValue === "function" ? showValue : (v: number) => v
  const at = (v: number) => `${((v - min) / (max - min || 1)) * 100}%`
  const vertical = props.orientation === "vertical"

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-has-marks={marks?.length ? "" : undefined}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      onValueChange={(v) => {
        // While pressed, the bubble follows the thumb that moved.
        if (pressing.current) { const moved = v.findIndex((x, i) => x !== values[i]); if (moved >= 0) setPressed(moved) }
        setInner(v); onValueChange?.(v)
      }}
      onPointerDown={(e) => {
        onPointerDown?.(e)
        if (e.button !== 0 || props.disabled) return
        pressing.current = true
        // A press on the track: which thumb it moves is the nearest one to where it landed.
        const rect = e.currentTarget.getBoundingClientRect()
        const t = vertical ? 1 - (e.clientY - rect.top) / (rect.height || 1) : (e.clientX - rect.left) / (rect.width || 1)
        setPressed(nearest(min + Math.max(0, Math.min(1, t)) * (max - min)))
      }}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=horizontal]:h-4 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        // Room for the marks under the track, reserved whether or not anything is shown in it.
        marks?.length && !vertical && "mb-5",
        className
      )}
      style={{ ["--slider-tone" as string]: TONE[tone], ...style }}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-[var(--slider-tone)] data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {marks?.length && !vertical ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-full mt-1 h-4">
          {marks.map((m) => {
            const v = typeof m === "number" ? m : m.value
            const label = typeof m === "number" ? undefined : m.label
            return (
              <span key={v} className="absolute top-0 flex -translate-x-1/2 flex-col items-center text-[10px] leading-none text-muted-foreground tabular-nums" style={{ left: at(v) }}>
                <i className="mb-0.5 block h-1 w-px bg-border" />
                {label}
              </span>
            )
          })}
        </div>
      ) : null}
      {values.map((v, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          onFocus={() => setFocused(index)}
          onBlur={() => setFocused(null)}
          className="relative block size-4 shrink-0 rounded-full border-2 pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5 border-[var(--slider-tone)] bg-background shadow-sm transition-[scale,box-shadow] duration-(--dur-quick) ease-(--ease-settle) outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 active:scale-125 disabled:pointer-events-none disabled:opacity-50"
        >
          {showValue && (
            <span
              aria-hidden
              data-slot="slider-value"
              data-shown={(pressed === null ? focused === index : pressed === index) || undefined}
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[11px] leading-4 whitespace-nowrap text-background opacity-0 transition-opacity duration-(--dur-quick) data-[shown]:opacity-100"
            >
              {format(v)}
            </span>
          )}
        </SliderPrimitive.Thumb>
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
