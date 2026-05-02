const http = require("http");
const https = require("https");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

// Load .env.local
const envPath = path.join(__dirname, ".env.local");
const envVars = {};
fs.readFileSync(envPath, "utf8")
  .split("\n")
  .forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) envVars[key.trim()] = rest.join("=").trim();
  });

const CLIENT_ID = envVars.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = envVars.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3001/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌  GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing from .env.local");
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  }).toString();

// Start a one-time local server to catch the OAuth callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3001");
  if (url.pathname !== "/callback") {
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.end(`<html><body style="font-family:system-ui;padding:40px"><h2>❌ Authorization denied: ${error}</h2></body></html>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.end("No code received.");
    server.close();
    return;
  }

  // Exchange code for tokens
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }).toString();

  const tokenData = await post("https://oauth2.googleapis.com/token", body);

  if (tokenData.error) {
    res.end(`<html><body style="font-family:system-ui;padding:40px"><h2>❌ Token error: ${tokenData.error_description}</h2></body></html>`);
    console.error("\n❌ Token exchange failed:", tokenData.error_description);
    server.close();
    process.exit(1);
  }

  const refreshToken = tokenData.refresh_token;

  res.end(`
    <html><body style="font-family:-apple-system,system-ui;padding:40px;background:#f5f5f7;margin:0">
      <div style="background:white;border-radius:16px;padding:32px;max-width:600px;box-shadow:0 4px 16px rgba(0,0,0,0.1)">
        <h2 style="margin:0 0 8px;color:#1c1c1e">✅ Authorization successful</h2>
        <p style="color:#636366;margin:0 0 24px">Your refresh token has been printed to the terminal. You can close this tab.</p>
        <div style="background:#f2f2f7;border-radius:8px;padding:16px;font-family:monospace;font-size:12px;word-break:break-all;color:#1c1c1e">${refreshToken}</div>
      </div>
    </body></html>
  `);

  console.log("\n✅  Authorization successful!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("GOOGLE_REFRESH_TOKEN=" + refreshToken);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\nCopy that line into your .env.local file.\n");

  server.close();
});

server.listen(3001, () => {
  console.log("\n🔐  Google OAuth Setup\n");
  console.log("⚠️   IMPORTANT: Before proceeding, make sure you've added");
  console.log("    this exact URI to your Google OAuth credentials:");
  console.log("\n    http://localhost:3001/callback\n");
  console.log("    Google Console → Your OAuth app → Authorized redirect URIs\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Opening browser for authorization...\n");
  exec(`open "${authUrl}"`);
});

// Simple HTTPS POST helper
function post(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Failed to parse response: " + data)); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
