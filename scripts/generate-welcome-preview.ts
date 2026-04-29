/**
 * Renders the welcome email template to a standalone HTML file at the
 * repo root for browser preview. Run with:
 *
 *   npx tsx scripts/generate-welcome-preview.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { welcomeEmailHtml } from "../lib/email/welcome";

const html = welcomeEmailHtml({
  dashboardUrl: "https://knetc.team/chat/alex",
  marketingUrl: "https://knetc.team",
});

const out = resolve(__dirname, "..", "welcome-preview.html");
writeFileSync(out, html, "utf8");
console.log(`Wrote ${out} (${html.length.toLocaleString()} bytes)`);
