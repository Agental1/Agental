"use client";

import { useRef } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { logoutAction } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface UserMenuProps {
  /** The picture or initials, already rendered. */
  avatar: React.ReactNode;
  email: string;
  /** Where "Profile" goes. Left out for portals with no profile page. */
  profileHref?: string;
  settingsHref: string;
  labels: { account: string; profile: string; settings: string; signOut: string };
  /**
   * What opens the menu. Default: the avatar alone (top right). The sidebar
   * passes the avatar with the email next to it (round 10).
   */
  trigger?: React.ReactNode;
  triggerClassName?: string;
  side?: "top" | "bottom" | "right";
  align?: "start" | "end";
}

/**
 * The account menu: the picture and email, then Profile, Settings and Sign out.
 * Opened by the avatar at the top right and, since round 10, by the account at
 * the bottom left of the sidebar (folded: the avatar alone). Sign out submits a
 * real form, so it works the same as the button it replaces (the server action
 * clears the session and redirects).
 */
export function UserMenu({
  avatar,
  email,
  profileHref,
  settingsHref,
  labels,
  trigger,
  triggerClassName,
  side = "bottom",
  align = "end",
}: UserMenuProps) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={labels.account}
          className={cn(
            "pressable outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            trigger ? triggerClassName : "flex size-11 items-center justify-center rounded-full"
          )}
        >
          {trigger ?? avatar}
        </DropdownMenuTrigger>
        <DropdownMenuContent side={side} align={align} className="min-w-56">
          <DropdownMenuLabel className="flex items-center gap-2 font-normal">
            <span className="flex shrink-0" aria-hidden="true">{avatar}</span>
            <span className="min-w-0 truncate text-sm">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {profileHref && (
            <DropdownMenuItem onSelect={() => router.push(profileHref)}>
              <User aria-hidden="true" /> {labels.profile}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => router.push(settingsHref)}>
            <Settings aria-hidden="true" /> {labels.settings}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => form.current?.requestSubmit()}>
            <LogOut aria-hidden="true" /> {labels.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form ref={form} action={logoutAction} className="hidden" />
    </>
  );
}
