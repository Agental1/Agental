/**
 * Is this browser still signed in? Asked when a save answers
 * "errors.unauthorized", before sending anyone to the sign-in page: a save
 * can fail for other reasons, and a person who is signed in must never be
 * taken away from their recording. Network trouble counts as signed in.
 */
export async function stillSignedIn(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return true;
    const body = (await res.json()) as { user?: { id?: string } } | null;
    return !!body?.user?.id;
  } catch {
    return true;
  }
}
