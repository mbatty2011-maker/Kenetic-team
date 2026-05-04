import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

export class StripeNotConnectedError extends Error {
  constructor(public readonly userId: string) {
    super(`Stripe account not connected for user ${userId}`);
    this.name = "StripeNotConnectedError";
  }
}

type CacheEntry = { key: string; exp: number };
const keyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function clearStripeKeyCache(userId: string): void {
  keyCache.delete(userId);
}

type StripeRow = {
  refresh_token: string;
  account_label: string | null;
  livemode: boolean | null;
};

async function loadStripeRow(userId: string): Promise<StripeRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_oauth_tokens")
    .select("refresh_token, account_label, livemode")
    .eq("user_id", userId)
    .eq("provider", "stripe")
    .maybeSingle<StripeRow>();

  if (error) throw new Error(`Failed to load Stripe token row: ${error.message}`);
  if (!data) throw new StripeNotConnectedError(userId);
  return data;
}

export async function getStripeApiKey(userId: string): Promise<string> {
  if (!userId) throw new Error("getStripeApiKey: userId is required");

  const hit = keyCache.get(userId);
  if (hit && Date.now() < hit.exp) return hit.key;

  const row = await loadStripeRow(userId);

  let plaintext: string;
  try {
    plaintext = decryptToken(row.refresh_token);
  } catch {
    // Decryption failure means the key is unusable. Drop the row so the
    // user reconnects rather than getting opaque errors on every request.
    const admin = createAdminClient();
    await admin
      .from("user_oauth_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "stripe");
    keyCache.delete(userId);
    throw new StripeNotConnectedError(userId);
  }

  keyCache.set(userId, { key: plaintext, exp: Date.now() + CACHE_TTL_MS });
  return plaintext;
}

export async function getStripeClient(userId: string): Promise<Stripe> {
  const key = await getStripeApiKey(userId);
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export async function getStoredStripeAccountInfo(
  userId: string
): Promise<{ account_label: string | null; livemode: boolean | null }> {
  const row = await loadStripeRow(userId);
  return { account_label: row.account_label, livemode: row.livemode };
}

export function encryptStripeKey(plaintext: string): string {
  return encryptToken(plaintext);
}

export { STRIPE_API_VERSION };
