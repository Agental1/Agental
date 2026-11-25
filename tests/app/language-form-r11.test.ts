import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import talents from "../../messages/ja/talents.json";
import app from "../../messages/ja/app.json";

/**
 * Round 11, group 4: Settings > Language lists the eight languages with a
 * search field, alphabetically by English name, each in its own name with the
 * English one next to it, the current one checked.
 */
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/talents/app/parametres",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/app/actions/settings", () => ({ saveLanguage: vi.fn(), saveNotifications: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { LanguageForm } = await import("@/components/app/settings-forms");

describe("Settings > Language (round 11)", () => {
  it("renders the search field and eight languages in order, the current one checked", () => {
    const html = renderToString(
      createElement(NextIntlClientProvider, {
        locale: "ja",
        timeZone: "America/Los_Angeles",
        messages: { talents, app },
      } as unknown as Parameters<typeof NextIntlClientProvider>[0], createElement(LanguageForm, { current: "it" }))
    );
    expect(html).toContain('type="search"');
    expect(html).toContain("言語を検索");
    const order = ["中文", "English", "Français", "Italiano", "日本語", "한국어", "Português", "Español"].map((n) =>
      html.indexOf(`>${n}</span>`)
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.replace(/<!-- -->/g, "")).toContain("(Italian)");
    const checked = html.split('aria-checked="true"');
    expect(checked).toHaveLength(2);
    expect(checked[1].slice(0, checked[1].indexOf("</button>"))).toContain("Italiano");
  });
});
