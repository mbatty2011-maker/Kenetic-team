import type { SupabaseClient } from "@supabase/supabase-js";

export interface BrandProfile {
  brand_voice?: string;
  target_audience?: string;
  value_propositions?: string;
  mission?: string;
  taglines?: string;
  dos_and_donts?: string;
}

const FIELD_LABELS: Record<keyof BrandProfile, string> = {
  brand_voice:        "Brand Voice",
  target_audience:    "Target Audience",
  value_propositions: "Value Propositions",
  mission:            "Mission",
  taglines:           "Taglines",
  dos_and_donts:      "Do's and Don'ts",
};

export const BRAND_FIELDS = Object.keys(FIELD_LABELS) as (keyof BrandProfile)[];

export async function readBrandProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return "";

    const row = data as Record<string, unknown>;
    const sections = BRAND_FIELDS
      .filter((k) => typeof row[k] === "string" && (row[k] as string).trim().length > 0)
      .map((k) => `## ${FIELD_LABELS[k]}\n${(row[k] as string).trim()}`);

    return sections.join("\n\n");
  } catch {
    return "";
  }
}

export async function upsertBrandProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<BrandProfile>
): Promise<void> {
  const filtered: Record<string, string> = {};
  for (const k of BRAND_FIELDS) {
    const v = patch[k];
    if (typeof v === "string") filtered[k] = v;
  }
  if (Object.keys(filtered).length === 0) return;

  const { error } = await supabase
    .from("brand_profiles")
    .upsert({ user_id: userId, ...filtered }, { onConflict: "user_id" });

  if (error) throw new Error(`Failed to save brand profile: ${error.message}`);
}
