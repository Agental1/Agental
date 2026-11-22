/** The number in front of a question (Preferences, round 8c), in reading order. */
export function StepNumber({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold tabular-nums text-accent-fg align-[0.1em]">
      {n}
    </span>
  );
}
