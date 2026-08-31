"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { ShieldAlert, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { openMinorCase, advanceMinorCase } from "@/app/actions/minors";

export interface MinorCaseData {
  id: string;
  prefectoralAuthStatus: string;
  parentalPresence: boolean;
  escrowPercent: number;
  escrowStatus: string;
  state: string;
}

export function MinorWorkflow({
  candidatureId,
  minorCase,
}: {
  candidatureId: string;
  minorCase: MinorCaseData | null;
}) {
  const t = useTranslations("casting");
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="rounded-sedan border border-warning/40 bg-warning/5 p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-5 text-warning" />
        <h2 className="font-display text-lg font-medium">{t("space.minors.title")}</h2>
        {minorCase?.state === "READY" && (
          <Badge variant="success">Prêt à convoquer</Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-fg-muted">{t("space.minors.subtitle")}</p>

      {!minorCase ? (
        <Button
          className="mt-4"
          disabled={pending}
          onClick={() => run(() => openMinorCase(candidatureId))}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Ouvrir le dossier de protection
        </Button>
      ) : (
        <ul className="mt-4 space-y-2">
          <StepRow
            done={minorCase.prefectoralAuthStatus === "GRANTED"}
            label={t("space.minors.authLabel")}
            status={
              minorCase.prefectoralAuthStatus === "GRANTED"
                ? t("space.minors.authGranted")
                : minorCase.prefectoralAuthStatus === "REQUESTED"
                  ? t("space.minors.authRequested")
                  : t("space.minors.authTodo")
            }
            action={
              minorCase.prefectoralAuthStatus === "NONE"
                ? { label: t("space.minors.request"), fn: () => advanceMinorCase(minorCase.id, "requestAuth") }
                : minorCase.prefectoralAuthStatus === "REQUESTED"
                  ? { label: t("space.minors.markGranted"), fn: () => advanceMinorCase(minorCase.id, "grantAuth") }
                  : undefined
            }
            pending={pending}
            run={run}
          />
          <StepRow
            done={minorCase.parentalPresence}
            label={t("space.minors.parentalLabel")}
            status={minorCase.parentalPresence ? t("space.minors.parentalOk") : t("space.minors.parentalTodo")}
            action={
              !minorCase.parentalPresence
                ? { label: t("space.minors.confirm"), fn: () => advanceMinorCase(minorCase.id, "confirmParental") }
                : undefined
            }
            pending={pending}
            run={run}
          />
          <StepRow
            done={minorCase.escrowStatus === "HELD"}
            label={t("space.minors.escrowLabel", { percent: minorCase.escrowPercent })}
            status={minorCase.escrowStatus === "HELD" ? t("space.minors.escrowHeld") : t("space.minors.escrowTodo")}
            action={
              minorCase.escrowStatus !== "HELD"
                ? { label: "Bloquer", fn: () => advanceMinorCase(minorCase.id, "holdEscrow") }
                : undefined
            }
            pending={pending}
            run={run}
          />
        </ul>
      )}
    </div>
  );
}

function StepRow({
  done,
  label,
  status,
  action,
  pending,
  run,
}: {
  done: boolean;
  label: string;
  status: string;
  action?: { label: string; fn: () => Promise<unknown> };
  pending: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-sedan border border-border bg-surface p-3 text-sm">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-success text-white" : "border border-border"
        }`}
      >
        {done && <Check className="size-3" />}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      <Badge variant={done ? "success" : "warning"}>{status}</Badge>
      {action && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(action.fn)}>
          {action.label}
        </Button>
      )}
    </li>
  );
}
