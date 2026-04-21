import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SYSTEM_PROMPTS, type AgentKey } from "@/lib/agents";
import { tavilySearch, formatSearchResults } from "@/lib/tools/search";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { AGENT_TOOLS, executeAgentTool, TOOL_LABELS } from "@/lib/agent-tools";

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

  const { agentKey, message, conversationId } = await req.json() as {
    agentKey: AgentKey;
    message: string;
    conversationId: string;
  };

  if (!SYSTEM_PROMPTS[agentKey]) {
    return NextResponse.json({ error: "Invalid agent" }, { status: 400 });
  }

  const agentTools = AGENT_TOOLS[agentKey] ?? [];
  const hasSearchTool = agentTools.some((t) => t.name === "web_search");

  // Load conversation history and knowledge base in parallel
  const [historyResult, knowledgeBase] = await Promise.all([
    supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20),
    readKnowledgeBase(),
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

  const systemPrompt = [
    SYSTEM_PROMPTS[agentKey],
    knowledgeBase ? `---\n## LineSkip Knowledge Base (live)\n${knowledgeBase}\n---` : "",
    searchContext ? `---\n## Web Search Results\n${searchContext}\n---` : "",
  ].filter(Boolean).join("\n\n");

  const initialMessages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: "user", content: message },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object | string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        if (didSearch) send({ type: "searching" });

        let currentMessages = [...initialMessages];

        // Agentic loop — handles tool use transparently
        while (true) {
          const apiStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
            system: systemPrompt,
            messages: currentMessages,
            ...(agentTools.length > 0 ? { tools: agentTools } : {}),
          });

          for await (const event of apiStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ text: event.delta.text });
            }
          }

          const finalMsg = await apiStream.finalMessage();
          if (finalMsg.stop_reason !== "tool_use") break;

          // Execute tool calls
          const toolUses = finalMsg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          currentMessages.push({ role: "assistant", content: finalMsg.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            send({ type: "tool_running", tool: tu.name, label: TOOL_LABELS[tu.name] ?? tu.name });
            const result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>);
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
          }

          currentMessages.push({ role: "user", content: toolResults });
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch {
        send({ error: "Stream error" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
