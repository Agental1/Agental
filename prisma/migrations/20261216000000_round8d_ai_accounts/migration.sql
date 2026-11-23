-- Round 8d, group 4: "AI accounts" on the admin dashboard. Additive: one new
-- table, RLS on, no policy. Holds only what the founders type (the balance
-- after a top-up, the alert threshold, a monthly budget) and the alerts
-- already sent, never a key: API keys stay in Vercel's environment.
CREATE TABLE IF NOT EXISTS "AiProviderAccount" (
  "provider" TEXT PRIMARY KEY,
  "balanceCents" INTEGER,
  "balanceSetAt" TIMESTAMP(3),
  "thresholdCents" INTEGER NOT NULL DEFAULT 2000,
  "monthlyBudgetCents" INTEGER,
  "lastAlerts" TEXT NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "AiProviderAccount" ENABLE ROW LEVEL SECURITY;
