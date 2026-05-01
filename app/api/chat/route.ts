import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SYSTEM_PROMPTS, type AgentKey } from "@/lib/agents";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { AGENT_TOOLS, executeAgentTool, TOOL_LABELS } from "@/lib/agent-tools";
import { getUserContext, buildUserSection } from "@/lib/tools/user-context";
import { checkDailyLimit } from "@/lib/rate-limit";
import {
  getUserTier,
  MONTHLY_MESSAGE_LIMITS,
  MEMORY_DAYS,
  currentMonth,
} from "@/lib/tier";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

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

  let agentKey: AgentKey, message: string, conversationId: string;
  try {
    ({ agentKey, message, conversationId } = await req.json() as {
      agentKey: AgentKey;
      message: string;
      conversationId: string;
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || message.length > 32000)
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  if (!conversationId || typeof conversationId !== "string")
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  if (!SYSTEM_PROMPTS[agentKey]) {
    return NextResponse.json({ error: "Invalid agent" }, { status: 400 });
  }

  // Daily throttle + tier resolution in parallel
  const [{ allowed, count, limit }, tier] = await Promise.all([
    checkDailyLimit(supabase, user.id),
    getUserTier(supabase, user.id),
  ]);

  if (!allowed) {
    return NextResponse.json(
      { error: `Daily limit reached (${count}/${limit} messages). Resets at midnight.` },
      { status: 429 }
    );
  }

  // Monthly per-agent limit
  const messageLimit = MONTHLY_MESSAGE_LIMITS[tier];
  const month = currentMonth();

  if (messageLimit !== Infinity) {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "check_and_increment_message_count",
      { p_user_id: user.id, p_agent_key: agentKey, p_month: month, p_limit: messageLimit }
    );
    if (rpcError) {
      console.error("[chat] message count check failed:", rpcError.message);
    } else {
      const result = (rpcData as Array<{ allowed: boolean; current_count: number }> | null)?.[0];
      if (result && !result.allowed) {
        return NextResponse.json(
          { error: "limit_reached", tier, limit: messageLimit, current: result.current_count },
          { status: 429 }
        );
      }
    }
  }

  const agentTools = AGENT_TOOLS[agentKey] ?? [];

  // History date cutoff based on plan
  const memoryCutoffDays = MEMORY_DAYS[tier];
  const memoryFrom = memoryCutoffDays !== null
    ? new Date(Date.now() - memoryCutoffDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const [historyResult, knowledgeBase, userContext] = await Promise.all([
    memoryFrom
      ? supabase.from("messages").select("role, content")
          .eq("conversation_id", conversationId)
          .gte("created_at", memoryFrom)
          .order("created_at", { ascending: false })
          .limit(20)
      : supabase.from("messages").select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(20),
    readKnowledgeBase(supabase, user.id),
    getUserContext(supabase, user.id),
  ]);

  const historyMessages = (historyResult.data ?? [])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const userSection = buildUserSection(userContext, user.email ?? "");

  const memoryNote = memoryCutoffDays !== null
    ? `[System: This user's plan limits conversation memory to the past ${memoryCutoffDays} days. Older messages have been excluded from context.]`
    : "";

  // First-message onboarding instruction for Alex
  let firstMessageInstruction = "";
  if (agentKey === "alex") {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "assistant");
    if ((count ?? 1) === 0) {
      firstMessageInstruction = `---
This is the user's very first interaction with their AI executive team. They typed this as part of onboarding.

Do NOT give advice yet or answer their question directly. Instead:
1. Reflect back what you heard — show you understood the real challenge beneath their words.
2. Name the core tension or risk you see in their situation.
3. Ask ONE focused question to find out where they are most stuck right now.

Keep it to 3–4 sentences. Warm, sharp, no fluff. No lists or headers — just a short paragraph.
---`;
    }
  }

  const systemPrompt = [
    SYSTEM_PROMPTS[agentKey],
    firstMessageInstruction,
    knowledgeBase ? `---\n## Knowledge Base (live)\n${knowledgeBase}\n---` : "",
    userSection,
    memoryNote,
  ].filter(Boolean).join("\n\n");

  const initialMessages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();

  const MAX_CHAT_ITERATIONS = 8;
  const MAX_TOKENS = 8192;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object | string) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      };
      // SSE comment lines (`: ...`) are ignored by the EventSource/reader but
      // keep the underlying TCP connection alive. iOS Safari and some mobile
      // proxies kill fetch streams that go idle for ~30s; tool calls
      // (file generation, Supabase upload, signed URL, follow-up Anthropic
      // round-trip) routinely exceed that — sending a heartbeat every 10s
      // prevents "Load failed" mid-tool.
      const sendHeartbeat = () => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch {}
      };

      try {
        const currentMessages = [...initialMessages];

        // Agentic loop — handles tool use transparently
        let iterationExhausted = true;
        for (let _iter = 0; _iter < MAX_CHAT_ITERATIONS; _iter++) {
          const streamParams = {
            model: "claude-sonnet-4-6" as const,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: currentMessages,
            ...(agentTools.length > 0 ? { tools: agentTools } : {}),
          };
          const apiStream = anthropic.messages.stream(streamParams);

          for await (const event of apiStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ text: event.delta.text });
            }
          }

          const finalMsg = await apiStream.finalMessage();
          if (finalMsg.stop_reason !== "tool_use") { iterationExhausted = false; break; }

          // Execute tool calls
          const toolUses = finalMsg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          currentMessages.push({ role: "assistant", content: finalMsg.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            send({ type: "tool_running", tool: tu.name, label: TOOL_LABELS[tu.name] ?? tu.name });
            const heartbeat = setInterval(sendHeartbeat, 10000);
            try {
              const result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>, { supabase, userId: user.id });
              toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
            } finally {
              clearInterval(heartbeat);
            }
          }

          currentMessages.push({ role: "user", content: toolResults });
        }

        if (iterationExhausted) {
          send({ error: "Max tool iterations reached without a final response." });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        console.error("[chat] stream error:", msg);
        try {
          send({ error: msg });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // Controller already closed — client disconnected or request timed out
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so SSE chunks reach the client immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
