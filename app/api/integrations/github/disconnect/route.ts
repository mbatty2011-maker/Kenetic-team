import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearGitHubTokenCache } from "@/lib/tools/github-auth";

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
    .eq("provider", "github");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  clearGitHubTokenCache(user.id);
  return NextResponse.json({ ok: true });
}
