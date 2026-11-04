// Runs automatically before `npm run dev`.
// 1. Checks the Node.js version.  2. Creates .env.local from .env.example if it's missing
// (hidden "dot" files are hard to create by hand, so we do it for you).
import { copyFileSync, existsSync } from "node:fs";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  console.error(`\n✖ Node.js ${process.versions.node} is too old. Install the LTS version from https://nodejs.org (20.9 or newer), then run this again.\n`);
  process.exit(1);
}

if (!existsSync(".env.local")) {
  copyFileSync(".env.example", ".env.local");
  console.log("✔ Created .env.local — open it and add your Supabase URL + publishable key.");
}
