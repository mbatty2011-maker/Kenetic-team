/**
 * Sends a one-off test of the welcome email through Resend.
 *
 * Usage:
 *   npx tsx scripts/send-test-welcome.ts                     # sends to mbatty2011@gmail.com
 *   npx tsx scripts/send-test-welcome.ts you@example.com     # sends to a different address
 *
 * Loads RESEND_API_KEY and NEXT_PUBLIC_APP_URL from .env.local.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resend } from "resend";
import { welcomeEmailHtml, welcomeEmailText } from "../lib/email/welcome";

// --- Load .env.local without adding a dotenv dep -----------------------------
const envPath = resolve(__dirname, "..", ".env.local");
const envText = readFileSync(envPath, "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let value = m[2];
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (process.env[m[1]] === undefined) process.env[m[1]] = value;
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) throw new Error("RESEND_API_KEY missing from .env.local");

const TO = process.argv[2] ?? "mbatty2011@gmail.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://knetc.team";
const dashboardUrl = `${APP_URL}/chat/alex`;

const resend = new Resend(apiKey);

console.log(`Sending welcome test → ${TO}`);
console.log(`  from:         knetc <noreply@knetc.team>`);
console.log(`  dashboardUrl: ${dashboardUrl}`);

(async () => {
  const result = await resend.emails.send({
    from: "knetc <noreply@knetc.team>",
    to: TO,
    subject: "Your team is in.",
    text: welcomeEmailText({ dashboardUrl }),
    html: welcomeEmailHtml({ dashboardUrl }),
  });

  if (result.error) {
    console.error("\nSend failed:", result.error);
    process.exit(1);
  }
  console.log(`\nSent. Resend id: ${result.data?.id}`);
})();
