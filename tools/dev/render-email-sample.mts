// Local only: writes a sample of the round 9 automatic email layout to a file, to look at it.
import { writeFileSync } from "node:fs";
import { brandedEmail } from "../../src/lib/email-branded";
const out = process.argv[2] ?? "email-sample.html";
const e = brandedEmail({
  locale: "en",
  base: "https://www.agental.co",
  subject: "Welcome to Agental",
  preheader: "Your email is confirmed. Here is what comes next.",
  heading: "Welcome, Mia",
  paragraphs: ["Your email is confirmed. Here is what comes next:"],
  items: [
    { title: "Complete your profile to 100%: your first AI role search then starts on its own." },
    { title: "Roles that may fit you appear in Applications. You accept or decline each one." },
    { title: "Your AI agent in Messages answers your questions, and the Agental team is there too." },
  ],
  cta: { label: "Open your dashboard", url: "https://www.agental.co/en/talents/app" },
  footer: { why: "You get this email once, after confirming your address.", unsubscribeLabel: "Unsubscribe from these emails", unsubscribeUrl: "https://www.agental.co/en/desabonnement", settingsLabel: "Email settings", settingsUrl: "https://www.agental.co/en/talents/app/parametres", signature: "The Agental team" },
});
writeFileSync(out, e.html);
console.log("written", out);
