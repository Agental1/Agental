import { after } from "next/server";
import { drainOutbox } from "./outbox";
import { drainConfirmations } from "./confirmation";

/**
 * Run one outbox drain once the response is on its way.
 *
 * `after` keeps a serverless function alive for the task without holding the
 * response back. The drain is best effort: the lead is already stored with
 * its outbox row, so whatever happens here the cron route delivers the alert
 * later. A failure is one log line and nothing else.
 *
 * Outside a request (a test, a script) `after` throws; the task then runs
 * detached.
 */
export function scheduleOutboxDrain(): void {
  const task = async () => {
    try {
      await drainOutbox({ limit: 5 });
      // Round 9: the confirmation to the person (its own state, see ./confirmation.ts).
      await drainConfirmations({ limit: 5 });
    } catch (error) {
      console.error(
        "[limelight] outbox drain failed:",
        error instanceof Error ? error.name : "unknown error"
      );
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}
