import "server-only";
import { Octokit } from "@octokit/rest";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";

export class GitHubNotConnectedError extends Error {
  constructor(public readonly userId: string) {
    super(`GitHub not connected for user ${userId}`);
    this.name = "GitHubNotConnectedError";
  }
}

type CacheEntry = { token: string; exp: number };
const tokenCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function clearGitHubTokenCache(userId: string): void {
  tokenCache.delete(userId);
}

type GitHubRow = {
  refresh_token: string;
  account_label: string | null;
};

async function loadGitHubRow(userId: string): Promise<GitHubRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_oauth_tokens")
    .select("refresh_token, account_label")
    .eq("user_id", userId)
    .eq("provider", "github")
    .maybeSingle<GitHubRow>();

  if (error) throw new Error(`Failed to load GitHub token row: ${error.message}`);
  return data;
}

export async function getGitHubToken(userId: string): Promise<string | null> {
  if (!userId) return null;

  const hit = tokenCache.get(userId);
  if (hit && Date.now() < hit.exp) return hit.token;

  const row = await loadGitHubRow(userId);
  if (!row) return null;

  let plaintext: string;
  try {
    plaintext = decryptToken(row.refresh_token);
  } catch {
    const admin = createAdminClient();
    await admin
      .from("user_oauth_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("provider", "github");
    tokenCache.delete(userId);
    return null;
  }

  tokenCache.set(userId, { token: plaintext, exp: Date.now() + CACHE_TTL_MS });
  return plaintext;
}

export async function getOctokit(userId: string): Promise<Octokit> {
  const token = await getGitHubToken(userId);
  return new Octokit({
    auth: token ?? undefined,
    userAgent: "knetc-kai/1.0",
  });
}

export async function getStoredGitHubAccountInfo(
  userId: string
): Promise<{ account_label: string | null } | null> {
  const row = await loadGitHubRow(userId);
  if (!row) return null;
  return { account_label: row.account_label };
}

export function encryptGitHubToken(plaintext: string): string {
  return encryptToken(plaintext);
}
