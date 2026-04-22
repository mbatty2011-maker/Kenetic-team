import type { SupabaseClient } from "@supabase/supabase-js";

export async function getUserContext(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (!data) return "";

  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  if (d.full_name) parts.push(`User's name: ${d.full_name as string}`);
  if (d.company_name) parts.push(`Company: ${d.company_name as string}`);
  if (d.role_title) parts.push(`Their role: ${d.role_title as string}`);
  if (d.user_context) parts.push(`\n${d.user_context as string}`);

  return parts.join("\n");
}

export function buildUserSection(userContext: string, userEmail: string): string {
  const parts: string[] = [];
  if (userContext) parts.push(`\n\n## User Context\n${userContext}`);
  if (userEmail) {
    parts.push(
      `\nThe user's email address is: ${userEmail}. ` +
      `When drafting or sending emails, always use this as the recipient address.`
    );
  }
  return parts.join("");
}
