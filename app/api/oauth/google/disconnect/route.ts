import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { clearGoogleTokenCache } from "@/lib/tools/google-auth";
import { GOOGLE_REVOKE_ENDPOINT } from "../_helpers";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("user_oauth_tokens")
    .select("refresh_token")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle<{ refresh_token: string }>();

  if (row?.refresh_token) {
    try {
      const refreshToken = decryptToken(row.refresh_token);
      // Best-effort revocation; don't fail the disconnect if Google rejects.
      await fetch(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(refreshToken)}`, {
        method: "POST",
      }).catch(() => {});
    } catch {
      // Decryption failure shouldn't block deletion.
    }
  }

  const { error: delErr } = await admin
    .from("user_oauth_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "google");

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  clearGoogleTokenCache(user.id);
  return NextResponse.json({ ok: true });
}
