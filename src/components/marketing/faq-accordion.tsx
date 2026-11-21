"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqGroup {
  title: string;
  items: { q: string; a: string }[];
}

export function FaqAccordion({
  groups,
  level = 2,
}: {
  groups: FaqGroup[];
  /** Heading level of the group titles: 2 on the FAQ pages, 3 inside a section. */
  level?: 2 | 3;
}) {
  const GroupTitle = level === 2 ? "h2" : "h3";
  const Question = level === 2 ? "h3" : "h4";
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <div key={group.title}>
          <GroupTitle className="mb-3 text-[1.125rem] font-bold">{group.title}</GroupTitle>
          <div className="space-y-3">
            {group.items.map((item) => (
              <FaqRow key={item.q} q={item.q} a={item.a} as={Question} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FaqRow({ q, a, as: Question }: { q: string; a: string; as: "h3" | "h4" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-sedan-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex w-full items-center justify-between gap-4 rounded-sedan-lg px-5 py-4 text-left [--hover-scale:1.01] [--press-scale:1.02] hover:bg-surface-2/50"
      >
        <Question className="text-[15.5px] font-bold">{q}</Question>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-fg-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 text-[15px] leading-relaxed text-fg-muted">
          {a}
        </div>
      )}
    </div>
  );
}
