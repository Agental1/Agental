import * as React from "react";
import { cn } from "@/lib/utils";
import type { Portal } from "@/lib/utils";

/**
 * Scopes a subtree to a portal skin by setting `data-portal`.
 * Semantic tokens (--bg, --fg, --accent…) are remapped by the CSS cascade,
 * so children written against semantic utilities (bg-bg, text-fg, bg-accent)
 * automatically render in the correct skin. Used at the route-group layout
 * level in the app; also handy to preview both skins on one page.
 */
export function PortalTheme({
  portal,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { portal: Portal }) {
  return (
    <div
      data-portal={portal}
      className={cn("bg-bg text-fg font-sans", className)}
      {...props}
    >
      {children}
    </div>
  );
}
