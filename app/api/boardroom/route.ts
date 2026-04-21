import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SYSTEM_PROMPTS, type AgentKey } from "@/lib/agents";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { AGENT_TOOLS, callAgentWithTools } from "@/lib/agent-tools";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const BOARDROOM_AGENTS: AgentKey[] = ["jeremy", "kai", "dana", "marcus"];

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, conversationId } = await req.json();

  // Load boardroom history
  const { data: history } = await supabase
    .from("messages")
    .select("role, content, agent_key")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const historyMessages = (history ?? [])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const knowledgeBase = await readKnowledgeBase();
  const knowledgeSuffix = knowledgeBase
    ? `\n\n---\n## LineSkip Knowledge Base (live)\n${knowledgeBase}\n---`
    : "";

  const systemSuffix = `
The user sent this to the Boardroom: "${message}"
Only respond if this is relevant to your specific role. If it's outside your domain, respond with exactly: SKIP`;

  // Fan out to all boardroom agents in parallel
  const results = await Promise.allSettled(
    BOARDROOM_AGENTS.map(async (agentKey) => {
      const tools = AGENT_TOOLS[agentKey] ?? [];
      const content = await callAgentWithTools(
        SYSTEM_PROMPTS[agentKey] + knowledgeSuffix + systemSuffix,
        [...historyMessages, { role: "user", content: message }],
        tools,
        anthropic,
        1024
      );
      return { agentKey, content };
    })
  );

  const responses = results
    .filter((r): r is PromiseFulfilledResult<{ agentKey: AgentKey; content: string }> =>
      r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((r) => r.content && r.content.trim() !== "SKIP" && r.content.trim() !== "");

  return NextResponse.json({ responses });
}
