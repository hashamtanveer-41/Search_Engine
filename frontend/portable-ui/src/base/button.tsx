import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/utils"
import { Slot } from "radix-ui"

/** A 44 px hit area round a small control on a touch screen, past its edges, unseen. */
const HIT = "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"
/** On a touch screen the icons grow with the 44 px buttons, so they fill them: 20 px
 *  alone, 18 px beside a label. An icon given its own size keeps it. */
const ICON_ALONE = "pointer-coarse:[&_svg:not([class*='size-'])]:size-5"
const ICON_LABELLED = "pointer-coarse:[&_svg:not([class*='size-'])]:size-[18px]"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/35 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/35 focus-visible:border-destructive dark:bg-destructive/80 [--press-ring:color-mix(in_srgb,var(--destructive)_35%,transparent)]",
        // Custom: a confirming action (Approve, Publish). Its focus and press rings are green too.
        success:
          "bg-ok text-white hover:bg-ok/90 focus-visible:ring-ok/35 focus-visible:border-ok [--press-ring:color-mix(in_srgb,var(--ok)_35%,transparent)]",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // On a touch screen every size is a finger's 44 px (a tap-target audit on a
      // phone); the two smallest keep their look, with a 44 px hit area round them. At least 44 px, not
      // exactly: a button given `h-auto` for content of several lines (a notification) grows to fit it
      // (on a phone a fixed 44 px left the lines spilling out of their rows).
      size: {
        default: `h-9 px-4 py-2 has-[svg]:px-3 pointer-coarse:min-h-11 ${ICON_LABELLED}`,
        xs: `h-6 gap-1 rounded-md px-2 text-xs has-[svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3 ${HIT}`,
        sm: `h-8 gap-1.5 rounded-md px-3 has-[svg]:px-2.5 pointer-coarse:min-h-11 ${ICON_LABELLED}`,
        lg: `h-10 rounded-md px-6 has-[svg]:px-4 pointer-coarse:min-h-11 ${ICON_LABELLED}`,
        icon: `size-9 pointer-coarse:size-11 ${ICON_ALONE}`,
        "icon-xs": `size-6 rounded-md [&_svg:not([class*='size-'])]:size-3 ${HIT}`,
        "icon-sm": `size-8 pointer-coarse:size-11 ${ICON_ALONE}`,
        "icon-lg": `size-10 pointer-coarse:size-11 ${ICON_ALONE}`,
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  icon,
  iconLabel,
  onIconClick,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Custom: anything in the icon's place, first in the content, so it grows and fades with the
     *  rest when the button is pressed ("the arrow should enlarge with the button,
     *  that is a part of the button"). */
    icon?: React.ReactNode
    /** What a pointer over the icon is told (its title). */
    iconLabel?: string
    /** A click on the icon does this instead of the button's own click (a way inside, say). */
    onIconClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const content = (inner: React.ReactNode) => (
    // Stretched to the button's height: pressed, its scale makes it what an absolute badge inside is
    // placed against, so it is the button's whole box (less padding), and a badge stays in its corner
    // (a project's count jumped onto its icon when pressed).
    <span data-slot="button-content" className="inline-flex min-w-0 flex-auto items-center self-stretch [justify-content:inherit] [gap:inherit]">
      {icon != null && <span data-slot="button-icon" title={iconLabel} className="inline-flex shrink-0 items-center justify-center">{icon}</span>}
      {inner}
    </span>
  )
  const click = onIconClick
    ? (e: React.MouseEvent<HTMLButtonElement>) => {
        if (e.target instanceof Element && e.target.closest('[data-slot="button-icon"]')) { onIconClick(e); return }
        onClick?.(e)
      }
    : onClick
  // A link drawn as a button (asChild) has its content in the same box, so it presses as one does:
  // the app-wide sidebar's links did not.
  const child = asChild && React.isValidElement<{ children?: React.ReactNode }>(children)
    ? React.cloneElement(children, undefined, content(children.props.children))
    : children

  return (
    // Custom: its own data-slot, variant and size win over a wrapping trigger's (a TooltipTrigger
    // or DropdownMenuTrigger with asChild passes its data-slot down as a prop), so a button inside one
    // still looks and presses like a button (press.ts finds [data-slot="button"]).
    <Comp
      {...props}
      onClick={click}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
    >
      {/* Custom: the button's content in one box, so pressing can grow and fade it as a whole
          (styles.css, Press) without the button or anything around it moving. It fills the button
          and lines its content up as the button does, so a wide button's `ml-auto` or `flex-1`
          (a link's mark at the right edge, a search box's key) still has room. */}
      {asChild ? child : content(children)}
    </Comp>
  )
}

export { Button, buttonVariants }
