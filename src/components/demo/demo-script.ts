/**
 * The `?demo` tour, scene by scene. Edit this file to change the take; the
 * player (`demo-player.tsx`) only provides the primitives below.
 *
 * Every selector is a `data-demo="…"` hook on a real page. If you rename or
 * remove one, the tour stops with "[demo] element not found" in the console.
 *
 * Captions only restate what the site itself says. Anything shown from the
 * casting card's built-in sample (names, scores) is tagged "Demo data" on
 * screen, and the end card repeats it: the recording must not pass a canned
 * sample off as a live match.
 */

export const DEMO_LOCALE = "en" as const;
export const DEMO_START_PATH = "/talents";

export type EndCard = { kicker: string; title: string; note?: string };

export interface DemoDriver {
  wait(ms: number): Promise<void>;
  /** Show a caption (empty string hides it). `tag` renders as a small chip. */
  say(text: string, tag?: string): void;
  /** Client-side navigation, then wait until `readySelector` is in the DOM. */
  goto(path: string, readySelector: string): Promise<void>;
  /** Eased scroll to an element (or "top"). `ms = 0` jumps. */
  scrollTo(sel: string | "top", ms?: number, align?: "top" | "center"): Promise<void>;
  /** Outline every element matching `sel`; `null` clears. */
  highlight(sel: string | null): void;
  /** Type into an input, character by character, over `ms`. Without `text`,
   *  the field is cleared and its own default value is typed back in. */
  type(sel: string, text?: string, ms?: number): Promise<void>;
  click(sel: string): Promise<void>;
  /** Full-screen title card; `behind` runs while the card hides the page. */
  chapter(kicker: string, title: string, ms: number, behind?: () => Promise<void>): Promise<void>;
  finish(card: EndCard): void;
}

const $ = (hook: string) => `[data-demo="${hook}"]`;
const DEMO_DATA = "Demo data";

export async function runDemoScript(d: DemoDriver) {
  // ── 0–5 s · Talents landing ─────────────────────────────────────────────
  await d.goto(DEMO_START_PATH, $("talents-hero"));
  await d.scrollTo("top", 0);
  d.say("Agental is a new-generation artist agency.");
  await d.wait(2300);
  d.say("Talents get a real agent, and an AI that works for them around the clock.");
  await d.wait(2800);

  // ── 5–14 s · How it works for a talent ──────────────────────────────────
  await d.chapter("01 / For talents", "An agent that works<br>while you perform", 1700, () =>
    d.scrollTo($("talents-steps"), 0, "center")
  );
  d.say("Create a profile, sign a free mandate, and the AI spots the castings made for you.");
  for (let i = 1; i <= 5; i++) {
    d.highlight(`${$("talents-steps")} > li:nth-child(${i})`);
    await d.wait(900);
  }
  d.highlight(null);
  d.say("A built-in self-tape studio coaches framing, light and sound.");
  await d.scrollTo($("talents-selftape"), 1000, "center");
  await d.wait(1900);

  // ── 14–29 s · Casting: brief → short-list ───────────────────────────────
  await d.chapter("02 / For casting directors", "One brief.<br>One short-list.", 1700, () =>
    d.goto("/casting", $("casting-demo"))
  );
  await d.scrollTo($("casting-demo"), 700, "center");
  d.highlight($("casting-demo"));
  d.say("A casting director describes the role.");
  // Retypes the card's own sample brief, so the field and the card header agree.
  await d.type($("casting-brief-input"), undefined, 1500);
  await d.wait(400);
  await d.click($("casting-generate"));
  d.highlight(`${$("casting-result")} li`);
  d.say("Every profile is scored, and only a tight short-list is kept.", DEMO_DATA);
  await d.wait(2700);
  d.highlight($("source-chip"));
  d.say("Each one shows its source: represented by Agental, or external.", DEMO_DATA);
  await d.wait(2800);
  d.highlight(null);

  // ── 29–33 s · Neutrality ────────────────────────────────────────────────
  d.say("Same scoring for every source, and every ranking explains itself.");
  await d.scrollTo($("casting-neutrality"), 1100, "center");
  d.highlight(`${$("casting-neutrality")} .grid > div`);
  await d.wait(2200);
  d.highlight(null);

  // ── End card ────────────────────────────────────────────────────────────
  d.say("");
  d.finish({
    kicker: "03 / Agental",
    title: "Talents get an agent.<br>Casting gets a short-list.",
    note: "Short-list shown in this video uses demo data.",
  });
}
