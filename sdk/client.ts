// Small typed client so callers don't hand-roll fetch calls.
//   const api = agental();
//   const { castings } = await api.castings.list();

export type Casting = {
  id: string;
  title: string;
  category: string;
  city: string;
  status: string;
  pay_min: number | null;
  pay_max: number | null;
  deadline: string | null;
  description?: string | null;
  created_at: string;
};

export type LeadInput = {
  email: string;
  kind: "talent" | "director";
  message?: string;
};

export function agental(baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") {
  async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, init);
    if (!res.ok) {
      throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    health: () => req<{ ok: boolean; db: boolean; ts: number }>("/api/health"),

    castings: {
      list: () => req<{ castings: Casting[] }>("/api/castings"),
      get: (id: string) => req<{ casting: Casting }>(`/api/castings/${id}`),
    },

    leads: {
      create: (lead: LeadInput) =>
        req<{ ok: true }>("/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(lead),
        }),
    },
  };
}
