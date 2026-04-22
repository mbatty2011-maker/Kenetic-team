import type { SupabaseClient } from "@supabase/supabase-js";

const FREE_DAILY_LIMIT = 100;

export async function checkDailyLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());

  const current = count ?? 0;
  return { allowed: current < FREE_DAILY_LIMIT, count: current, limit: FREE_DAILY_LIMIT };
}
