let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get access token: " + JSON.stringify(data));

  cachedToken = data.access_token;
  // Google tokens last 3600s; cache for 55 minutes to give a safe buffer
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return cachedToken!;
}
