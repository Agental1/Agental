// Which connection string `prisma migrate deploy` should use on the host.
//
// Supabase offers three ways in:
//   - direct:              db.<ref>.supabase.co:5432            IPv6 only
//   - transaction pooler:  <region>.pooler.supabase.com:6543    the app's DATABASE_URL
//   - session pooler:      <region>.pooler.supabase.com:5432    IPv4, keeps a session
//
// Migrations need a real session (advisory locks, DDL), so the transaction
// pooler is out. The direct host is unreachable from build machines that have
// no IPv6 route, which is the case on Vercel: a DIRECT_URL pointing there
// fails with P1001 before anything runs. The session pooler is the same
// pooler as DATABASE_URL on port 5432, with the same user and password, so it
// can be derived from DATABASE_URL without anyone handling the password.
//
// Pure, so it is tested (tests/db/migration-url.test.ts). Never log the
// returned url: it carries the password. Log `via` instead.

const DIRECT_HOST = /^db\.[a-z0-9]+\.supabase\.co$/i;
const POOLER_HOST = /\.pooler\.supabase\.com$/i;

function parse(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ url: string, via: string, derived: boolean } | null}
 */
export function migrationUrl(env) {
  const direct = parse(env.DIRECT_URL);
  const pooled = parse(env.DATABASE_URL);

  // A DIRECT_URL that is anything but the IPv6-only host is taken as given:
  // the session pooler, a local database, another provider.
  if (direct && !DIRECT_HOST.test(direct.hostname)) {
    return { url: direct.toString(), via: `${direct.hostname}:${direct.port || "5432"}`, derived: false };
  }

  if (pooled && POOLER_HOST.test(pooled.hostname)) {
    const session = new URL(pooled.toString());
    session.port = "5432";
    // Options that only make sense for the transaction pooler.
    session.searchParams.delete("pgbouncer");
    session.searchParams.delete("connection_limit");
    return { url: session.toString(), via: `${session.hostname}:5432 (session pooler, derived from DATABASE_URL)`, derived: true };
  }

  // Nothing better: the direct host as given, or DATABASE_URL as a last resort.
  const fallback = direct ?? pooled;
  if (!fallback) return null;
  return { url: fallback.toString(), via: `${fallback.hostname}:${fallback.port || "5432"}`, derived: false };
}
