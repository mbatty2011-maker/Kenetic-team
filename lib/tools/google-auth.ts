import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";

export class GoogleNotConnectedError extends Error {
  constructor(public readonly userId: string) {
    super(`Google account not connected for user ${userId}`);
    this.name = "GoogleNotConnectedError";
  }
}

type CacheEntry = { token: string; exp: number };
const cache = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 55 * 60 * 1000;
const SAFETY_BUFFER_MS = 30 * 1000;

export function clearGoogleTokenCache(userId: string): void {
  cache.delete(userId);
}

type TokenRow = {
  refresh_token: string;
  access_token: string | null;
  access_expires_at: string | null;
};

export async function getGoogleAccessToken(userId: string): Promise<string> {
  if (!userId) throw new Error("getGoogleAccessToken: userId is required");

  const hit = cache.get(userId);
  if (hit && Date.now() < hit.exp - SAFETY_BUFFER_MS) return hit.token;

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("user_oauth_tokens")
    .select("refresh_token, access_token, access_expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle<TokenRow>();

  if (error) throw new Error(`Failed to load Google token row: ${error.message}`);
  if (!row) throw new GoogleNotConnectedError(userId);

  // Warm-start: reuse persisted access token if it's still valid for >60s.
  if (row.access_token && row.access_expires_at) {
    const expMs = new Date(row.access_expires_at).getTime();
    if (Number.isFinite(expMs) && Date.now() < expMs - 60_000) {
      try {
        const token = decryptToken(row.access_token);
        cache.set(userId, { token, exp: expMs });
        return token;
      } catch {
        // Fall through to refresh on decryption failure
      }
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(row.refresh_token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to decrypt refresh token for user ${userId}: ${msg}`);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };

  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      // Token revoked or expired — drop it so the user reconnects.
      await admin
        .from("user_oauth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "google");
      cache.delete(userId);
      throw new GoogleNotConnectedError(userId);
    }
    throw new Error(`Failed to refresh Google access token: ${JSON.stringify(data)}`);
  }

  const expiresInSec = data.expires_in ?? 3600;
  const cacheExp = Date.now() + Math.min(CACHE_TTL_MS, (expiresInSec - 60) * 1000);
  cache.set(userId, { token: data.access_token, exp: cacheExp });

  // Best-effort persist (don't await — never block on the DB write)
  void admin
    .from("user_oauth_tokens")
    .update({
      access_token: encryptToken(data.access_token),
      access_expires_at: new Date(Date.now() + (expiresInSec - 60) * 1000).toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "google")
    .then(({ error: updErr }) => {
      if (updErr) console.warn("[google-auth] access_token persist failed:", updErr.message);
    });

  return data.access_token;
}
