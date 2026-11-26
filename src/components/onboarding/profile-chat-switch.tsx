"use client";

import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OnboardingChat } from "./onboarding-chat";

/**
 * Round 12, group 6: on the profile page, "Continue with {agent}" opens the
 * chat in place of the form, and "Switch to the form" goes back. Both read and
 * write the same profile; a full load makes either side start from what is
 * saved.
 */
function reloadWith(view: "chat" | "form") {
  window.location.assign(`${window.location.pathname}?view=${view}`);
}

export function ProfileChatSwitch({ enabled, agentName, showChat, children }: { enabled: boolean; agentName: string; showChat: boolean; children: React.ReactNode }) {
  const t = useTranslations("talents");
  if (!enabled) return <>{children}</>;
  if (showChat) return <OnboardingChat scope="profile" onSwitchToForm={() => reloadWith("form")} />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => reloadWith("chat")}>
          <MessageCircle />
          {t("onboarding.chat.continueWith", { agent: agentName })}
        </Button>
      </div>
      {children}
    </div>
  );
}
