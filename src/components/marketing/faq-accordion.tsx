"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";

export interface FaqGroup {
  title: string;
  items: { q: string; a: string }[];
}

export function FaqAccordion({ groups }: { groups: FaqGroup[] }) {
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <div key={group.title}>
          {/* The mockups set the group label as a mono eyebrow, not an h2 —
              the questions themselves carry the heading weight. */}
          <Eyebrow as="h2" className="mb-4 block">
            {group.title}
          </Eyebrow>
          <div className="space-y-3">
            {group.items.map((item) => (
              <FaqRow key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-sedan-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/50"
      >
        <h3 className="text-[15.5px] font-semibold">{q}</h3>
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
