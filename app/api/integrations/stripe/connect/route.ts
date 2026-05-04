import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  STRIPE_API_VERSION,
  clearStripeKeyCache,
  encryptStripeKey,
} from "@/lib/tools/stripe-auth";

function safeError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return safeError("unauthorized", 401);

  let body: { apiKey?: unknown };
  try {
    body = (await request.json()) as { apiKey?: unknown };
  } catch {
    return safeError("invalid_body");
  }

  const apiKeyRaw = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKeyRaw) return safeError("api_key_required");
  if (!/^(rk|sk)_(live|test)_[A-Za-z0-9_]+$/.test(apiKeyRaw)) {
    return safeError("invalid_api_key_format");
  }

  const restricted = apiKeyRaw.startsWith("rk_");

  const probe = new Stripe(apiKeyRaw, { apiVersion: STRIPE_API_VERSION });

  try {
    await probe.balance.retrieve();
  } catch (err) {
    const code =
      err instanceof Stripe.errors.StripeError ? err.code ?? err.type : "validation_failed";
    return safeError(`stripe_validation_failed:${code}`);
  }

  // Live vs test is encoded in the key prefix; no need to derive from the API.
  const livemode = /^(sk|rk)_live_/.test(apiKeyRaw);

  let accountLabel: string | null = null;
  try {
    const account = await probe.accounts.retrieveCurrent();
    const name =
      account.business_profile?.name ||
      account.settings?.dashboard?.display_name ||
      account.email ||
      null;
    accountLabel = name ? `${name} (${account.id})` : account.id;
  } catch {
    // Stripe restricted keys may lack permission to read account info; that's
    // fine — leave the label null and proceed.
  }

  const admin = createAdminClient();
  const { error: upsertErr } = await admin.from("user_oauth_tokens").upsert(
    {
      user_id: user.id,
      provider: "stripe",
      refresh_token: encryptStripeKey(apiKeyRaw),
      access_token: null,
      access_expires_at: null,
      scope: restricted ? "restricted" : "secret",
      account_label: accountLabel,
      livemode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  if (upsertErr) {
    console.error("[stripe/connect] upsert failed:", upsertErr.message);
    return safeError("store_failed", 500);
  }

  clearStripeKeyCache(user.id);

  return NextResponse.json({
    ok: true,
    account_label: accountLabel,
    livemode,
    restricted,
  });
}
