import { hasSupabase } from "@/lib/supabase/env";

export default function Home() {
  return (
    <main>
      <h1>Agental API</h1>
      <p>
        Backend for the Agental platform.{" "}
        {hasSupabase ? "Connected to Supabase." : "No Supabase config yet — set .env.local."}
      </p>
      <h2>Routes</h2>
      <ul>
        <li>
          <code>GET /api/health</code>
        </li>
        <li>
          <code>GET /api/castings</code>
        </li>
        <li>
          <code>GET /api/castings/[id]</code>
        </li>
        <li>
          <code>POST /api/leads</code>
        </li>
      </ul>
    </main>
  );
}
