import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearStripeKeyCache } from "@/lib/tools/stripe-auth";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_oauth_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "stripe");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  clearStripeKeyCache(user.id);
  return NextResponse.json({ ok: true });
}
