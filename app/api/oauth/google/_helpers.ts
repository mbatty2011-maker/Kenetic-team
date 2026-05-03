import "server-only";

export const GOOGLE_SCOPES = [
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
];

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export const STATE_COOKIE = "oauth_state_google";
export const STATE_COOKIE_PATH = "/api/oauth/google";
export const STATE_COOKIE_MAX_AGE = 15 * 60;

const ALLOWED_NEXT = new Set(["/onboarding", "/settings"]);

export function assertSafeNext(value: string | null | undefined): string {
  if (!value) return "/settings";
  if (ALLOWED_NEXT.has(value)) return value;
  return "/settings";
}

export function getRedirectUri(originFromRequest: string): string {
  // Prefer the explicit env var (matches what's registered in Google Cloud
  // Console) but fall back to the request origin so local dev works without
  // additional config.
  const fromEnv = process.env.GOOGLE_REDIRECT_URI;
  if (fromEnv) return fromEnv;
  return `${originFromRequest}/api/oauth/google/callback`;
}
