import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserTier, type Tier } from "@/lib/tier";

const DAILY_DESKTOP_SESSIONS: Record<Tier, number> = {
  free:    0,
  solo:    5,
  startup: 20,
  scale:   50,
};

const MAX_CONCURRENT_PER_USER = 1;

export type DesktopLimitResult =
  | { ok: true; tier: Tier }
  | { ok: false; reason: string };

// Returns ok if the user can start a new desktop session. Reason on failure is
// formatted as a TOOL_ERROR string so the agent's tool-result handler can pass
// it back to Claude verbatim and Claude will surface the right message.
export async function checkDesktopSessionLimit(
  supabase: SupabaseClient,
  userId: string,
): Promise<DesktopLimitResult> {
  const tier = await getUserTier(supabase, userId);

  if (DAILY_DESKTOP_SESSIONS[tier] === 0) {
    return {
      ok: false,
      reason:
        "TOOL_ERROR: Desktop sessions require a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry. Tell the user they need to upgrade to use the desktop tool.",
    };
  }

  // Concurrent check — using the SECURITY DEFINER RPC so service-role + RLS
  // contexts both work. We only need a count, but RPC returns full rows; that's
  // fine for a max of MAX_CONCURRENT_PER_USER.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: active, error: activeErr } = await (supabase as any).rpc(
    "get_active_computer_jobs",
    { p_user_id: userId },
  );
  if (activeErr) {
    console.error("[desktopRateLimit] get_active_computer_jobs failed", {
      userId,
      error: activeErr.message,
    });
    return {
      ok: false,
      reason: `TOOL_ERROR: Could not verify desktop session limits (${activeErr.message}). STOP. Do not retry. Tell the user something went wrong starting the desktop session.`,
    };
  }
  const activeCount = Array.isArray(active) ? active.length : 0;
  if (activeCount >= MAX_CONCURRENT_PER_USER) {
    return {
      ok: false,
      reason:
        "TOOL_ERROR: Only one desktop session at a time. The user already has a desktop session open — wait for it to finish (or have them stop it) before starting another. STOP. Do not retry.",
    };
  }

  // Daily cap
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: todayCount, error: countErr } = await (supabase as any).rpc(
    "count_user_computer_jobs_today",
    { p_user_id: userId },
  );
  if (countErr) {
    console.error("[desktopRateLimit] count_user_computer_jobs_today failed", {
      userId,
      error: countErr.message,
    });
    return {
      ok: false,
      reason: `TOOL_ERROR: Could not verify desktop session limits (${countErr.message}). STOP. Do not retry.`,
    };
  }
  const dailyCap = DAILY_DESKTOP_SESSIONS[tier];
  if (typeof todayCount === "number" && todayCount >= dailyCap) {
    return {
      ok: false,
      reason: `TOOL_ERROR: Daily desktop session limit reached (${dailyCap}/day on ${tier} plan). STOP. Do not retry. Tell the user they've hit today's desktop session cap and to try again tomorrow or upgrade.`,
    };
  }

  return { ok: true, tier };
}
