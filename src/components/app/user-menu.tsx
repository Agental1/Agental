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

export interface UserMenuProps {
  /** The picture or initials, already rendered. */
  avatar: React.ReactNode;
  email: string;
  /** Where "Profile" goes. Left out for portals with no profile page. */
  profileHref?: string;
  settingsHref: string;
  labels: { account: string; profile: string; settings: string; signOut: string };
}

/**
 * The avatar at the top right opens Profile, Settings and Sign out. Sign out
 * submits a real form, so it works the same as the button it replaces (the
 * server action clears the session and redirects).
 */
export function UserMenu({ avatar, email, profileHref, settingsHref, labels }: UserMenuProps) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={labels.account}
          className="pressable flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {avatar}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{email}</DropdownMenuLabel>
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
