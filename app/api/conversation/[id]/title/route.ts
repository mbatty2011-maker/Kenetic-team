import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true })
    .limit(4);

  if (!messages || messages.length < 2) return NextResponse.json({ title: null });

  const context = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
    .join("\n\n");

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 20,
    messages: [{
      role: "user",
      content: `Write a title for this conversation. Max 6 words. No quotes. No punctuation at end. Be specific to the topic.\n\n${context}`,
    }],
  });

  const raw = res.content[0]?.type === "text" ? res.content[0].text.trim() : null;
  const title = raw?.replace(/^["']|["']$/g, "").replace(/[.!?]$/, "") ?? null;

  if (title) {
    await supabase
      .from("conversations")
      .update({ title })
      .eq("id", params.id)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ title });
}
