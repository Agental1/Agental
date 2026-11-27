import { useTranslations } from "next-intl";
import { Building2, ClipboardList, Megaphone, Clapperboard } from "lucide-react";

const KINDS = [
  { key: "boards", Icon: ClipboardList },
  { key: "breakdowns", Icon: Building2 },
  { key: "notices", Icon: Clapperboard },
  { key: "calls", Icon: Megaphone },
] as const;

/**
 * Round 12 g5: the agent at work. Stylized cards for the KINDS of places roles
 * show up (casting boards, breakdowns, production notices, open calls) pass a
 * lens. No site names, no counts, no roles: nothing here is data. The
 * animation is CSS only; with reduced motion the cards stand still.
 */
export function SearchScan({ agent, running = false }: { agent: string; running?: boolean }) {
  const t = useTranslations("talents.space.dashboard.findRoles.scan");
  // Two identical halves so the loop has no jump.
  const cards = [...KINDS, ...KINDS];
  return (
    <div role="status" className="flex w-full flex-col items-center gap-3">
      <div className="scan-stage" aria-hidden="true">
        <div className="scan-track">
          {cards.map(({ key, Icon }, i) => (
            <div key={i} className="scan-card">
              <span className="flex items-center gap-2 text-[13px] font-bold">
                <Icon className="size-4 text-[#246BFE]" />
                {t(`kind.${key}`)}
              </span>
              <i />
              <i />
              <i />
            </div>
          ))}
        </div>
        <span className="scan-lens" />
      </div>
      <p className="text-[15px] font-medium">{running ? t("running", { agent }) : t("looking", { agent })}</p>
    </div>
  );
}
