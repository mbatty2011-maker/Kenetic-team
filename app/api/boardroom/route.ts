import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AGENTS, SYSTEM_PROMPTS, type AgentKey } from "@/lib/agents";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { AGENT_TOOLS, callAgentWithTools } from "@/lib/agent-tools";
import { getUserContext, buildUserSection } from "@/lib/tools/user-context";
import { getUserTier, BOARDROOM_SESSION_LIMITS, currentMonth } from "@/lib/tier";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// All five specialists — Maya now included
const BOARDROOM_AGENTS: AgentKey[] = ["jeremy", "kai", "dana", "marcus", "maya"];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

  let message: string, conversationId: string;
  try {
    ({ message, conversationId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || message.length > 32000)
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  if (!conversationId || typeof conversationId !== "string")
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });

  // Session limit check — returned as JSON so the frontend can show the upgrade prompt
  const tier = await getUserTier(supabase, user.id);
  const sessionLimit = BOARDROOM_SESSION_LIMITS[tier];
  const month = currentMonth();

  if (sessionLimit !== Infinity) {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "check_and_increment_boardroom_count",
      { p_user_id: user.id, p_month: month, p_limit: sessionLimit }
    );
    if (!rpcError) {
      const result = (rpcData as Array<{ allowed: boolean; current_count: number }> | null)?.[0];
      if (result && !result.allowed) {
        return NextResponse.json(
          { error: "limit_reached", tier, limit: sessionLimit, current: result.current_count },
          { status: 429 }
        );
      }
    }
  }

  // Load shared context before opening the stream
  const { data: history } = await supabase
    .from("messages")
    .select("role, content, agent_key")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const historyMessages = (history ?? [])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const [knowledgeBase, userContext] = await Promise.all([
    readKnowledgeBase(supabase, user.id),
    getUserContext(supabase, user.id),
  ]);
  const userSection = buildUserSection(userContext, user.email ?? "");
  const knowledgeSuffix = [
    knowledgeBase ? `\n\n---\n## Knowledge Base (live)\n${knowledgeBase}\n---` : "",
    userSection,
  ].join("");

  const agentSuffix = `

The founder sent this to the full Boardroom: "${message}"
Only respond if this is directly relevant to your specific role. If it is outside your domain, respond with exactly: SKIP

BOARDROOM RULE: Use your tools directly — no permission needed. Produce concrete deliverables (spreadsheets, drafts, analyses) where useful. Keep responses focused and actionable.`;

  const encoder = new TextEncoder();
  const userId = user.id;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      try {
        send({ type: "status", message: "Consulting the team…" });

        const agentResults: { agentKey: AgentKey; content: string }[] = [];

        // All 5 specialists fire in parallel — each streams its response the instant it finishes
        await Promise.allSettled(
          BOARDROOM_AGENTS.map(async (agentKey) => {
            let content: string;
            try {
              content = await callAgentWithTools(
                SYSTEM_PROMPTS[agentKey] + knowledgeSuffix + agentSuffix,
                [...historyMessages, { role: "user", content: message }],
                AGENT_TOOLS[agentKey] ?? [],
                anthropic,
                2048,
                { supabase, userId, agent: agentKey as "jeremy" | "kai" | "dana" | "marcus" | "maya", conversationId }
              );
            } catch (err) {
              console.error(`[boardroom] ${agentKey} error:`, err);
              content = "";
            }

            if (!content?.trim() || content.trim() === "SKIP") return;

            agentResults.push({ agentKey, content });

            // Stream immediately — the client sees this agent's response right now
            send({ type: "agent_response", agentKey, content });

            // Persist to DB — fire and don't block the stream
            supabase.from("messages").insert({
              conversation_id: conversationId,
              user_id: userId,
              agent_key: agentKey,
              role: "assistant",
              content,
            }).then(({ error }) => {
              if (error) console.error(`[boardroom] save failed (${agentKey}):`, error.message);
            });
          })
        );

        if (agentResults.length === 0) {
          // No relevant responses — send a polite fallback from Alex
          const fallback = "None of the team had relevant input for that specific topic. Try rephrasing, or direct your question to a specific agent (e.g. Jeremy for financials, Kai for technical questions).";
          send({ type: "synthesis", agentKey: "alex", content: fallback });
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            user_id: userId,
            agent_key: "alex",
            role: "assistant",
            content: fallback,
          });
        } else {
          // Alex synthesises all specialist responses
          send({ type: "synthesizing" });

          const responsesSummary = agentResults
            .map((r) => {
              const agent = AGENTS.find((a) => a.key === r.agentKey);
              return `## ${agent?.name ?? capitalize(r.agentKey)} (${agent?.role ?? ""})\n${r.content}`;
            })
            .join("\n\n---\n\n");

          const synthesisSystem = `${SYSTEM_PROMPTS.alex}${knowledgeSuffix}

You are writing an Executive Synthesis for the boardroom. The founder asked:
"${message}"

Your team responded:
${responsesSummary}

Write a concise Executive Synthesis that:
- Pulls the single most important insight or action from each team member's response
- Flags any trade-offs or tensions between their views
- Closes with one clear, specific recommended next action for the founder

Write the synthesis immediately — no preamble, no "here is my synthesis", just the content. Be decisive and direct.`;

          let synthesis = "";
          try {
            synthesis = await callAgentWithTools(
              synthesisSystem,
              [{ role: "user", content: message }],
              [], // No tools during synthesis — pure reasoning
              anthropic,
              2048
            );
          } catch (err) {
            console.error("[boardroom] Alex synthesis error:", err);
          }

          if (synthesis?.trim()) {
            send({ type: "synthesis", agentKey: "alex", content: synthesis });
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              user_id: userId,
              agent_key: "alex",
              role: "assistant",
              content: synthesis,
            });
          }
        }

        // Update conversation + generate title
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        try {
          await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/conversation/${conversationId}/title`,
            { method: "POST" }
          );
        } catch {}

        send({ type: "done" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[boardroom] fatal:", msg);
        send({ type: "error", message: msg });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
