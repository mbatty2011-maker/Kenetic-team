const https = require("https");
const fs = require("fs");
const path = require("path");

// Load .env.local
const env = {};
fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n")
  .forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;

const KNOWLEDGE_BASE_CONTENT = `# LineSkip Knowledge Base
Last updated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

---

## Company Overview
LineSkip is a computer vision self-checkout system for shopping carts. Founded by Michael Batty, age 14, in Lehi, Utah. Michael is a member of the Church of Jesus Christ of Latter-day Saints.

Current stage: Pre-revenue Proof of Concept (POC). Vision is to build the most affordable smart cart system at scale, then found Logic AI — a safe AGI company.

Michael's exit plan: POC → Letter of Intent (LOI) → angel raise → exit before LDS mission at approximately age 18.

Best friend and business partner: Zeke Fraser.
Father: Garrett Batty (filmmaker), handling LLC registration with a transfer clause for Michael's future control.

---

## Product & Technology
Hardware stack per cart:
- Raspberry Pi 5 (8GB RAM)
- Raspberry Pi Camera Module 3 Wide
- Waveshare 7" touchscreen display
- YOLOv8 nano vision model
- Hardware cost: ~$359 per cart
- Pi network: IP 192.168.68.92, username: lineskippoc

Trained product classes (10 total):
Campbell Soup, Cheerios, Skippy Peanut Butter, Heinz Ketchup, Minute Maid Orange Juice, Maruchan Ramen, Oreos, Kraft Mac & Cheese, Quaker Oats, Ritz Crackers

Architecture: Vision-only system. Load cells were evaluated and dropped from design. Computer vision handles all item detection. No weight sensors required.

---

## Financial Data
- Hardware cost: ~$359 per cart (all-in)
- Current revenue: $0 (pre-revenue POC stage)
- Target investors: Utah-based VCs — Kickstart Fund, Peterson Ventures
- Fundraising stage: Pre-seed / angel, post-LOI

Unit economics target: SaaS subscription model per cart per month (pricing TBD post-LOI).

Competitor pricing for reference:
- Caper Cart (Instacart): $5,000–$10,000/cart
- Amazon Dash Cart: Proprietary/closed ecosystem
- Veeve: Enterprise pricing, not disclosed
- Tracxpoint: Hardware-heavy, expensive

LineSkip advantage: ~15–30x cheaper than nearest competitor.

---

## Sales & Partnerships
Primary pilot target:
- Contact: Tait (store director, Macey's grocery)
- Macey's is part of Associated Food Stores network (~500 stores across the Intermountain West)
- Goal: POC demo → Letter of Intent → pilot at Macey's → expand to AFS network

Sales strategy: Build the relationship with Tait first. POC must be compelling enough to get an LOI. LOI unlocks angel fundraising. Keep the pitch simple: lowest cost, proven technology, Utah company.

Competitive positioning: Nobody has cracked affordable smart cart deployment at scale. LineSkip is the only sub-$400/cart vision-only solution.

---

## Legal & Compliance
Entity: LLC in formation. Garrett Batty handling registration with a transfer clause to ensure Michael retains control.

Michael is 14 years old — minor-specific legal considerations apply to all contracts, fundraising documents, and equity agreements. All agreements involving Michael may require parental co-signature.

IP: YOLOv8 model trained on proprietary dataset. Hardware design and software stack are original work.

Fundraising docs needed post-LOI: SAFE note or convertible note, cap table, IP assignment agreement.

---

## Meeting Notes
[This section is updated by the team as meetings occur]

---

## Decisions Log
[Key decisions are logged here as they are made]

- Dropped load cells from hardware design (vision-only is simpler, cheaper, more reliable)
- Target: Macey's / Tait as first pilot partner
- Exit strategy: Pre-mission sale, ~age 18
`;

async function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log("\n📚  Creating LineSkip Knowledge Base...\n");

  // Get access token
  const tokenBody = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  }).toString();

  const tokenData = await request({
    hostname: "oauth2.googleapis.com", path: "/token", method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(tokenBody) },
  }, tokenBody);

  if (!tokenData.access_token) {
    console.error("❌  Failed to get access token:", tokenData);
    process.exit(1);
  }
  console.log("✓  Access token obtained");

  // Create the Google Doc
  const createBody = JSON.stringify({ title: "LineSkip Knowledge Base" });
  const doc = await request({
    hostname: "docs.googleapis.com", path: "/v1/documents", method: "POST",
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(createBody) },
  }, createBody);

  if (!doc.documentId) {
    console.error("❌  Failed to create document:", doc);
    process.exit(1);
  }
  console.log("✓  Document created:", doc.documentId);

  // Insert content
  const insertBody = JSON.stringify({
    requests: [{ insertText: { location: { index: 1 }, text: KNOWLEDGE_BASE_CONTENT } }],
  });
  await request({
    hostname: "docs.googleapis.com",
    path: `/v1/documents/${doc.documentId}:batchUpdate`,
    method: "POST",
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(insertBody) },
  }, insertBody);
  console.log("✓  Knowledge base content populated");

  // Write the doc ID to .env.local
  const envPath = path.join(__dirname, ".env.local");
  let envContent = fs.readFileSync(envPath, "utf8");
  if (envContent.includes("KNOWLEDGE_BASE_DOC_ID=")) {
    envContent = envContent.replace(/KNOWLEDGE_BASE_DOC_ID=.*/, `KNOWLEDGE_BASE_DOC_ID=${doc.documentId}`);
  } else {
    envContent += `\nKNOWLEDGE_BASE_DOC_ID=${doc.documentId}`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log("✓  KNOWLEDGE_BASE_DOC_ID written to .env.local");

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅  Knowledge base ready!");
  console.log(`    Doc ID: ${doc.documentId}`);
  console.log(`    URL: https://docs.google.com/document/d/${doc.documentId}/edit`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("Restart the dev server to activate knowledge base injection.\n");
}

main().catch(console.error);
