import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { Octokit } from "@octokit/rest";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearGitHubTokenCache, encryptGitHubToken } from "@/lib/tools/github-auth";

function safeError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const TOKEN_FORMAT = /^(github_pat_|ghp_)[A-Za-z0-9_]+$/;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return safeError("unauthorized", 401);

  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return safeError("invalid_body");
  }

  const tokenRaw = typeof body.token === "string" ? body.token.trim() : "";
  if (!tokenRaw) return safeError("token_required");
  if (!TOKEN_FORMAT.test(tokenRaw)) {
    return safeError("invalid_token_format");
  }

  const probe = new Octokit({ auth: tokenRaw, userAgent: "knetc-kai/1.0" });

  let login: string;
  try {
    const { data: me } = await probe.users.getAuthenticated();
    login = me.login;
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status?: number }).status
        : null;
    if (status === 401) return safeError("github_token_invalid");
    if (status === 403) return safeError("github_token_forbidden");
    return safeError("github_validation_failed");
  }

  const fineGrained = tokenRaw.startsWith("github_pat_");

  const admin = createAdminClient();
  const { error: upsertErr } = await admin.from("user_oauth_tokens").upsert(
    {
      user_id: user.id,
      provider: "github",
      refresh_token: encryptGitHubToken(tokenRaw),
      access_token: null,
      access_expires_at: null,
      scope: fineGrained ? "fine_grained" : "classic",
      account_label: login,
      livemode: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  if (upsertErr) {
    console.error("[github/connect] upsert failed:", upsertErr.message);
    return safeError("store_failed", 500);
  }

  clearGitHubTokenCache(user.id);

  return NextResponse.json({
    ok: true,
    account_label: login,
    fine_grained: fineGrained,
  });
}
