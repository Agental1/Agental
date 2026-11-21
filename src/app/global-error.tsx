"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: it catches errors thrown by the root layout itself, so
 * React replaces the whole document with this — including <html> and <body>.
 *
 * It CANNOT be localised, and pretending otherwise would be a lie in the plan.
 * It renders outside NextIntlClientProvider (no messages), outside the [locale]
 * segment (no params, so no locale to read), outside the next/font variables and
 * outside data-portal. Any useTranslations call here throws inside an error
 * boundary, which is the one place a second throw is unrecoverable.
 *
 * So: French, the default locale, inline styles, no imports beyond React. It
 * exists to be correct, not pretty, and reaching it at all is a bug.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "#ffffff",
          color: "#0b0f1a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 500, margin: 0 }}>
          Une erreur inattendue est survenue
        </h1>
        <p style={{ color: "#4a5468", margin: 0, maxWidth: "32rem" }}>
          L&apos;incident a été enregistré. Réessayer suffit le plus souvent.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            minHeight: "2.75rem",
            padding: "0 1.5rem",
            borderRadius: "0.6rem",
            border: "none",
            background: "#246bfe",
            color: "#ffffff",
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "#566178", margin: 0 }}>
            {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
