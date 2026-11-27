"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/** How long a toast stays when nothing holds it; its bar (styles.css, Toasts) runs down this long. */
export const TOAST_MS = 5000

// Custom: toasts sit top right, each with a close button and a bar running down its time.
const Toaster = ({ theme = "system", duration = TOAST_MS, ...props }: ToasterProps) => {

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      closeButton
      // Every notification in view, one under another; repeats collapse instead (notify.ts).
      expand
      visibleToasts={50}
      duration={duration}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--ui-toast-ms": `${duration}ms`,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
