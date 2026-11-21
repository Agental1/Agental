import { sendEmail as defaultSendEmail } from "@/lib/mailer";
import { alertEmail, type WorkflowEnv } from "./config";

/**
 * What happens when a run is given up on.
 *
 * One log line with the run id, and one email when WORKFLOW_ALERT_EMAIL is
 * set. Both carry the run id and the kind of run and nothing else: no brief
 * text, no profile, no error message. Whoever receives it looks the run up.
 */
export async function alertDeadRun(
  run: { id: string; kind: string },
  deps: { env?: WorkflowEnv; sendEmail?: typeof defaultSendEmail } = {}
): Promise<void> {
  console.error(`[workflow] run dead ${run.id}`);
  const env = deps.env ?? process.env;
  const to = alertEmail(env);
  if (!to) return;
  const line = `Workflow run ${run.id} (${run.kind}) stopped after its last attempt.`;
  try {
    await (deps.sendEmail ?? defaultSendEmail)(
      {
        to,
        subject: "Agental workflow run stopped",
        text: line,
        html: `<p>${line}</p>`,
      },
      { env }
    );
  } catch {
    // The run is already recorded as DEAD. A failed alert changes nothing.
    console.error(`[workflow] alert not sent ${run.id}`);
  }
}
