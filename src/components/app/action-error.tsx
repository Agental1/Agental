"use client";

import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import type { ActionError } from "@/domain/action-result";
import { cn } from "@/lib/utils";

/**
 * Renders a server action's error in the visitor's language.
 *
 * Actions return a key, not a sentence (see src/domain/action-result.ts), so
 * translation has to happen here, on the client, where the active locale is
 * known. Ten components used to render `state.error` as a bare string; they now
 * all route through this one, which also means the `role="alert"` and the icon
 * are consistent instead of being re-invented per form.
 */
export function ActionErrorMessage({
  error,
  className,
}: {
  error?: ActionError;
  className?: string;
}) {
  const t = useTranslations("app");
  if (!error) return null;

  return (
    <p
      role="alert"
      className={cn(
        "flex items-center gap-2 rounded-sedan bg-danger/10 px-3 py-2 text-sm text-danger",
        className
      )}
    >
      <AlertCircle className="size-4 shrink-0" />
      {t(error.key, error.values)}
    </p>
  );
}

/** Same translation, as a plain string, for callers that own their markup. */
export function useActionErrorText(): (error?: ActionError) => string | null {
  const t = useTranslations("app");
  return (error) => (error ? t(error.key, error.values) : null);
}
