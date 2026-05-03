import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/crypto/tokens";
import { clearGoogleTokenCache } from "@/lib/tools/google-auth";
import {
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  assertSafeNext,
  getRedirectUri,
} from "../_helpers";

function fail(origin: string, next: string, reason: string) {
  const url = new URL(`${origin}${next}`);
  url.searchParams.set("google", "error");
  url.searchParams.set("reason", reason);
  const res = NextResponse.redirect(url.toString(), 302);
  res.cookies.set(STATE_COOKIE, "", { path: STATE_COOKIE_PATH, maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const cookieRaw = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const dotIdx = cookieRaw.indexOf(".");
  const cookieState = dotIdx >= 0 ? cookieRaw.slice(0, dotIdx) : cookieRaw;
  const cookieNextRaw = dotIdx >= 0 ? cookieRaw.slice(dotIdx + 1) : "";
  const next = assertSafeNext(cookieNextRaw);

  if (errorParam) return fail(origin, next, errorParam);
  if (!code || !stateParam) return fail(origin, next, "missing_code");
  if (!cookieState || cookieState !== stateParam) return fail(origin, next, "state_mismatch");

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`, 302);
  }

  const redirectUri = getRedirectUri(origin);

  const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
  };

  if (!tokenRes.ok || !tokenData.access_token) {
    return fail(origin, next, tokenData.error ?? "token_exchange_failed");
  }
  if (!tokenData.refresh_token) {
    // Google omits refresh_token if the user previously consented; prompt=consent
    // should prevent this, but guard anyway.
    return fail(origin, next, "no_refresh_token");
  }

  let email = "";
  try {
    const infoRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { email?: string };
      email = info.email ?? "";
    }
  } catch {
    // Non-fatal — store the token without an email.
  }

  const expiresInSec = tokenData.expires_in ?? 3600;
  const accessExpiresAt = new Date(Date.now() + (expiresInSec - 60) * 1000).toISOString();

  const admin = createAdminClient();
  const { error: upsertErr } = await admin
    .from("user_oauth_tokens")
    .upsert(
      {
        user_id: user.id,
        provider: "google",
        refresh_token: encryptToken(tokenData.refresh_token),
        access_token: encryptToken(tokenData.access_token),
        access_expires_at: accessExpiresAt,
        scope: tokenData.scope ?? null,
        google_email: email || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

  if (upsertErr) {
    console.error("[oauth/google/callback] upsert failed:", upsertErr.message);
    return fail(origin, next, "store_failed");
  }

  clearGoogleTokenCache(user.id);

  const successUrl = new URL(`${origin}${next}`);
  successUrl.searchParams.set("google", "connected");
  const res = NextResponse.redirect(successUrl.toString(), 302);
  res.cookies.set(STATE_COOKIE, "", { path: STATE_COOKIE_PATH, maxAge: 0 });
  return res;
}
