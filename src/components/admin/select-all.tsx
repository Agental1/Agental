"use client";

/** Ticks or clears every `name="id"` checkbox in the same form. */
export function SelectAll({ label }: { label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4 accent-[var(--accent)]"
      onChange={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        for (const box of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="id"]')) {
          box.checked = e.currentTarget.checked;
        }
      }}
    />
  );
}
