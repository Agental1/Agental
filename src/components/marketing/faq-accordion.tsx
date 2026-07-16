"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqGroup {
  title: string;
  items: { q: string; a: string }[];
}

export function FaqAccordion({ groups }: { groups: FaqGroup[] }) {
  return (
    <div className="space-y-12">
      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="mb-4 font-display text-2xl font-medium">
            {group.title}
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-sedan border border-border bg-surface">
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
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2/50"
      >
        <span className="font-medium">{q}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-fg-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm leading-relaxed text-fg-muted">
          {a}
        </div>
      )}
    </div>
  );
}
