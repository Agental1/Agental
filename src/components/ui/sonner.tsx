"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts for "Saved", "Uploaded", "Sent" and errors. Colors come from the
 * Agental roles, so a toast follows the Talent or Casting theme of the page it
 * appears on; `theme` stays light because our tokens already do the switch.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-accent" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-danger" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{ classNames: { toast: "font-sans !rounded-sedan-lg !shadow-lg", title: "!font-bold" } }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--sedan-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
export { toast } from "sonner";
