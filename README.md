# Agental Backend

The API behind Agental. Next.js route handlers on top of Supabase (Postgres + RLS).

## Routes

- `GET /api/health` — liveness, works without a DB
- `GET /api/castings` — open castings, newest first
- `GET /api/castings/:id` — one casting
- `POST /api/leads` — new lead `{ email, kind, message? }`

There's a small typed client in `sdk/client.ts`, and an example in `examples/usage.ts`.

## Running it

Need Node 20.9+ and a Supabase project.

```sh
npm install
```

Run the two SQL files in the Supabase SQL editor (in order):

```
supabase/migrations/0001_minimal_schema.sql
supabase/seed.sql
```

Then point the app at your project. `npm run dev` creates `.env.local` for you on
first run — fill in the two values from Supabase → Project Settings → API Keys:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

```sh
npm run dev
```

## Quick check

```sh
curl localhost:3000/api/health
curl localhost:3000/api/castings
curl -X POST localhost:3000/api/leads \
  -H 'content-type: application/json' \
  -d '{"email":"someone@example.com","kind":"talent"}'
```

## Notes

Only the public publishable key is used — the service-role key never touches this
repo, and `.env*` is gitignored. RLS keeps the anon key to reading open castings
and inserting (not reading) leads.

This is the core slice of the backend. Auth, the application pipeline, analytics
and the admin catalog live elsewhere.
