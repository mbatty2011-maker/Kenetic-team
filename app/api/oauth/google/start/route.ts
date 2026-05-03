import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_SCOPES,
  STATE_COOKIE,
  STATE_COOKIE_MAX_AGE,
  STATE_COOKIE_PATH,
  assertSafeNext,
  getRedirectUri,
} from "../_helpers";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams, origin } = new URL(request.url);
  const next = assertSafeNext(searchParams.get("next"));
  const state = randomBytes(32).toString("base64url");

  const redirectUri = getRedirectUri(origin);
  const consentUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  consentUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("response_type", "code");
  consentUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  consentUrl.searchParams.set("access_type", "offline");
  consentUrl.searchParams.set("prompt", "consent");
  consentUrl.searchParams.set("include_granted_scopes", "true");
  consentUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(consentUrl.toString(), 302);
  res.cookies.set(STATE_COOKIE, `${state}.${next}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: STATE_COOKIE_PATH,
    maxAge: STATE_COOKIE_MAX_AGE,
  });
  return res;
}
