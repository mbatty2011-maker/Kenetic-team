import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SYSTEM_PROMPTS, type AgentKey } from "@/lib/agents";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { AGENT_TOOLS, callAgentWithTools, executeAgentTool, TOOL_LABELS } from "@/lib/agent-tools";
import { getUserContext, buildUserSection } from "@/lib/tools/user-context";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const BOARDROOM_AGENTS: AgentKey[] = ["jeremy", "kai", "dana", "marcus"];

const ORCHESTRATION_CLASSIFIER = `You are Alex, Chief of Staff.

Your job: classify each user message as one of two modes.

Respond ONLY with a JSON object, no other text:
{"mode": "DIRECT_ANSWER"} — if this is a general question, simple request, or something you can handle alone without needing input from Jeremy (CFO), Kai (CTO), Dana (Sales), or Marcus (Legal).
{"mode": "ORCHESTRATE"} — if this task would genuinely benefit from specialist input from 2 or more team members and produces a deliverable (report, strategy, prep doc, analysis, plan).

Be conservative with ORCHESTRATE — only use it when the task truly needs multiple specialists. Simple questions, quick advice, single-domain questions = DIRECT_ANSWER.`;

const CLARIFICATION_SYSTEM = `You are Alex, Chief of Staff. You are about to orchestrate the team on a complex task.

Ask exactly 2-3 focused clarifying questions to fully understand what's needed before briefing the team. Be direct and specific. No filler. Number the questions.

After you have enough context (user answers your questions), respond ONLY with:
READY_TO_BRIEF: [one-sentence task summary]

Do not ask more than 3 questions total. Do not repeat questions.`;

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

  let message: string, conversationId: string, mode: string | undefined;
  try {
    ({ message, conversationId, mode } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!message || typeof message !== "string" || message.length > 32000)
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  if (!conversationId || typeof conversationId !== "string")
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });

  // Load conversation history
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  const historyMessages = (history ?? [])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const [knowledgeBase, userContext] = await Promise.all([
    readKnowledgeBase(),
    getUserContext(supabase, user.id),
  ]);
  const userSection = buildUserSection(userContext, user.email ?? "");
  const knowledgeSection = [
    knowledgeBase ? `\n\n---\n## Knowledge Base (live)\n${knowledgeBase}\n---` : "",
    userSection,
  ].join("");

  // Step 1: Classify intent (if not already in orchestration mode)
  if (!mode || mode === "classify") {
    const classifyResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 50,
      system: ORCHESTRATION_CLASSIFIER,
      messages: [{ role: "user", content: message }],
    });

    const classifyText = classifyResponse.content[0]?.type === "text"
      ? classifyResponse.content[0].text.trim()
      : '{"mode":"DIRECT_ANSWER"}';

    let intent = { mode: "DIRECT_ANSWER" };
    try {
      intent = JSON.parse(classifyText);
    } catch {}

    if (intent.mode === "DIRECT_ANSWER") {
      const alexTools = AGENT_TOOLS.alex ?? [];
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: object) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          try {
            const currentMessages: Anthropic.MessageParam[] = [
              ...historyMessages,
              { role: "user", content: message },
            ];

            const MAX_ALEX_ITERATIONS = 8;
            for (let _iter = 0; _iter < MAX_ALEX_ITERATIONS; _iter++) {
              const apiStream = anthropic.messages.stream({
                model: "claude-sonnet-4-6",
                max_tokens: 1024,
                system: SYSTEM_PROMPTS.alex + knowledgeSection,
                messages: currentMessages,
                ...(alexTools.length > 0 ? { tools: alexTools } : {}),
              });

              for await (const event of apiStream) {
                if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                  send({ type: "text", text: event.delta.text });
                }
              }

              const finalMsg = await apiStream.finalMessage();
              if (finalMsg.stop_reason !== "tool_use") break;

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

            send({ type: "done" });
            controller.close();
          } catch (err) {
            send({ type: "error", message: err instanceof Error ? err.message : "Stream error" });
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // ORCHESTRATE mode — start clarification flow
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Signal: entering orchestration
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: "orchestrate_start" })}\n\n`
          ));

          // Alex asks clarifying questions
          const clarifyStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 512,
            system: CLARIFICATION_SYSTEM + "\n\n" + (SYSTEM_PROMPTS.alex.split("Your two modes:")[1] ?? "") + knowledgeSection,
            messages: [...historyMessages, { role: "user", content: message }],
          });

          for await (const event of clarifyStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`
              ));
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // Step 2: Full orchestration — Alex has enough context, brief the team
  if (mode === "orchestrate") {
    const taskSummary = message;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const send = (data: object) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

          // Status: briefing team
          send({ type: "status", text: "Briefing the team..." });

          const agentResponses: Record<string, string> = {};

          // Fan out to all 4 agents
          const agentPromises = BOARDROOM_AGENTS.map(async (agentKey) => {
            send({ type: "status", text: `Waiting for ${capitalize(agentKey)}...` });

            const agentBrief = `${SYSTEM_PROMPTS[agentKey]}${knowledgeSection}

Alex has briefed the team on this task: "${taskSummary}"

Provide your specialist perspective. Be specific, actionable, and concise. Stay in your lane. This will be included in a final synthesis document.`;

            const tools = AGENT_TOOLS[agentKey] ?? [];
            try {
              const content = await callAgentWithTools(
                agentBrief,
                [...historyMessages, { role: "user", content: `Task brief from Alex: ${taskSummary}` }],
                tools,
                anthropic,
                1024
              );
              agentResponses[agentKey] = content;
            } catch {
              agentResponses[agentKey] = "[No response — agent encountered an error]";
            }
            send({ type: "agent_done", agentKey, name: capitalize(agentKey) });
          });

          await Promise.all(agentPromises);

          // Synthesize
          send({ type: "status", text: "Synthesizing final output..." });

          const today = new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          const synthesisPrompt = `You are Alex, Chief of Staff. Synthesize the team's input into a clean, structured final output.

TASK: ${taskSummary}
DATE: ${today}

Team responses:

JEREMY (CFO):
${agentResponses.jeremy}

KAI (CTO):
${agentResponses.kai}

DANA (Head of Sales):
${agentResponses.dana}

MARCUS (General Counsel):
${agentResponses.marcus}

Write the final synthesis document in this EXACT format:
TASK: ${taskSummary}
DATE: ${today}

FINANCIAL PERSPECTIVE (Jeremy)
[Jeremy's key points, cleaned up and organized]

TECHNICAL PERSPECTIVE (Kai)
[Kai's key points, cleaned up and organized]

SALES & PARTNERSHIPS (Dana)
[Dana's key points, cleaned up and organized]

LEGAL & COMPLIANCE (Marcus)
[Marcus's key points, cleaned up and organized]

RECOMMENDED NEXT STEPS (Alex)
[Your synthesis: 3-5 prioritized, specific action items based on all input]

Keep each section tight. No fluff.`;

          const synthesisResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: SYSTEM_PROMPTS.alex + knowledgeSection,
            messages: [{ role: "user", content: synthesisPrompt }],
          });

          const finalOutput = synthesisResponse.content[0]?.type === "text"
            ? synthesisResponse.content[0].text
            : "";

          send({ type: "synthesis_complete", content: finalOutput, taskSummary });
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
