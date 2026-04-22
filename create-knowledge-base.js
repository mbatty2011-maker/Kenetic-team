const https = require("https");
const fs = require("fs");
const path = require("path");

// Load .env.local
const env = {};
fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n")
  .forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;

const KNOWLEDGE_BASE_CONTENT = `# Knowledge Base
Last updated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

---

## Company Overview
[Add your company overview here after running setup.]

---

## Meeting Notes
[This section is updated by the team as meetings occur]

---

## Decisions Log
[Key decisions are logged here as they are made]
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
  console.log("\n📚  Creating Knowledge Base...\n");

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
  const createBody = JSON.stringify({ title: "Knowledge Base" });
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
