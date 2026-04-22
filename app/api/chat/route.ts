import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SYSTEM_PROMPTS, type AgentKey } from "@/lib/agents";
import { tavilySearch, formatSearchResults } from "@/lib/tools/search";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { AGENT_TOOLS, executeAgentTool, TOOL_LABELS } from "@/lib/agent-tools";
import { getUserContext, buildUserSection } from "@/lib/tools/user-context";
import { checkDailyLimit } from "@/lib/rate-limit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SEARCH_DETECTION_PROMPT = `Does this message require current/real-time information that wouldn't be in your training data (market prices, recent news, current events, live data)? Answer only YES or NO.`;

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

  const { allowed, count, limit } = await checkDailyLimit(supabase, user.id);
  if (!allowed) {
    return NextResponse.json(
      { error: `Daily limit reached (${count}/${limit} messages). Resets at midnight.` },
      { status: 429 }
    );
  }

  const agentTools = AGENT_TOOLS[agentKey] ?? [];
  const hasSearchTool = agentTools.some((t) => t.name === "web_search");

  // Load conversation history, knowledge base, and user context in parallel
  const [historyResult, knowledgeBase, userContext] = await Promise.all([
    supabase
      .from("messages")
      .select("role, content")
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

  // Auto-search only for agents without an explicit web_search tool
  let searchContext = "";
  let didSearch = false;
  if (process.env.TAVILY_API_KEY && !hasSearchTool) {
    try {
      const checkRes = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 5,
        messages: [{ role: "user", content: `${SEARCH_DETECTION_PROMPT}\n\nMessage: "${message}"` }],
      });
      const answer = checkRes.content[0]?.type === "text" ? checkRes.content[0].text.trim() : "NO";
      if (answer.startsWith("YES")) {
        const results = await tavilySearch(message, { maxResults: 4 });
        searchContext = formatSearchResults(results);
        didSearch = true;
      }
    } catch {
      // Search failed silently
    }
  }

  const userSection = buildUserSection(userContext, user.email ?? "");
  const systemPrompt = [
    SYSTEM_PROMPTS[agentKey],
    knowledgeBase ? `---\n## Knowledge Base (live)\n${knowledgeBase}\n---` : "",
    searchContext ? `---\n## Web Search Results\n${searchContext}\n---` : "",
    userSection,
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
      const send = (data: object | string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        if (didSearch) send({ type: "searching" });

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
            const result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>, { supabase, userId: user.id });
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
          }

          currentMessages.push({ role: "user", content: toolResults });
        }

        if (iterationExhausted) {
          send({ error: "Max tool iterations reached without a final response." });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        send({ error: err instanceof Error ? err.message : "Stream error" });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
