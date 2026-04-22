import type { SupabaseClient } from "@supabase/supabase-js";

export async function readKnowledgeBase(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("section_title, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) return "";

    return data
      .map((row: { section_title: string; content: string }) => `## ${row.section_title}\n${row.content}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

export async function appendToKnowledgeBase(
  supabase: SupabaseClient,
  userId: string,
  section: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from("knowledge_base")
    .insert({ user_id: userId, section_title: section, content });

  if (error) throw new Error(`Failed to save to knowledge base: ${error.message}`);
}
