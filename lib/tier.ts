import type { SupabaseClient } from "@supabase/supabase-js";

export type Tier = "free" | "solo" | "startup" | "scale";

export const MONTHLY_MESSAGE_LIMITS: Record<Tier, number> = {
  free:    15,
  solo:    100,
  startup: Infinity,
  scale:   Infinity,
};

// Conversation history window in days; null = unlimited
export const MEMORY_DAYS: Record<Tier, number | null> = {
  free:    7,
  solo:    90,
  startup: null,
  scale:   null,
};

export const BOARDROOM_SESSION_LIMITS: Record<Tier, number> = {
  free:    3,
  solo:    Infinity,
  startup: Infinity,
  scale:   Infinity,
};

function priceIdToTier(priceId: string): Tier {
  if (priceId === process.env.STRIPE_PRICE_STARTER)    return "solo";
  if (priceId === process.env.STRIPE_PRICE_PRO)        return "startup";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return "scale";
  return "free";
}

export async function getUserTier(supabase: SupabaseClient, userId: string): Promise<Tier> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, price_id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Silently swallowing this would treat every paying user as "free" if the
    // table is missing or RLS rejects the query — surface it loudly in logs.
    console.error("[getUserTier] subscriptions query failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    return "free";
  }

  if (!data?.price_id) return "free";
  return priceIdToTier(data.price_id);
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}
