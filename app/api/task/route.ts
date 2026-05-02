import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SYSTEM_PROMPTS, type AgentKey } from "@/lib/agents";
import { TASK_AGENT_TOOLS, executeAgentTool, TOOL_LABELS } from "@/lib/agent-tools";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { getUserContext, buildUserSection } from "@/lib/tools/user-context";
import { checkDailyLimit } from "@/lib/rate-limit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const MAX_ITERATIONS = 12;

const TASK_SUFFIX = `

## Autonomous task mode
You are working on a task assigned by the user. Work through it fully and autonomously:
- Break the task into steps and execute each one using your tools
- Think out loud before each tool call so the user can follow your reasoning
- Produce REAL deliverables — documents, spreadsheets, drafts — not just advice
- Do not ask for permission between steps (except SSH commands which auto-pause for confirmation)
- When done, start your final message with "TASK COMPLETE:" and summarize what you built with all links
`;

export type TaskStep = {
  type: "thinking" | "reasoning" | "tool_call" | "tool_result" | "confirm_required" | "done" | "error";
  label: string;
  text?: string;
  tool?: string;
  command?: string;
  timestamp: string;
};

export async function POST(req: NextRequest) {
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

  let agentKey: AgentKey, taskDescription: string;
  try {
    ({ agentKey, taskDescription } = await req.json() as {
      agentKey: AgentKey;
      taskDescription: string;
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!taskDescription || typeof taskDescription !== "string" || taskDescription.length > 32000)
    return NextResponse.json({ error: "Invalid task description" }, { status: 400 });
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

  // Use RPC to bypass PostgREST schema cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: task, error: taskError } = await (supabase as any).rpc("create_task", {
    p_user_id: user.id,
    p_agent_key: agentKey,
    p_title: taskDescription.slice(0, 120),
  });

  if (taskError || !task) {
    return NextResponse.json({ error: taskError?.message ?? "Failed to create task" }, { status: 500 });
  }

  const [knowledgeBase, userContext] = await Promise.all([
    readKnowledgeBase(supabase, user.id),
    getUserContext(supabase, user.id),
  ]);
  const userSection = buildUserSection(userContext, user.email ?? "");
  const systemPrompt = [
    SYSTEM_PROMPTS[agentKey],
    knowledgeBase ? `---\n## Knowledge Base\n${knowledgeBase}\n---` : "",
    userSection,
    TASK_SUFFIX,
  ].filter(Boolean).join("\n\n");

  const tools = TASK_AGENT_TOOLS[agentKey] ?? [];
  const allSteps: TaskStep[] = [];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      const persist = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("update_task", {
          p_task_id: task.id,
          p_user_id: user.id,
          p_steps: allSteps,
        }).then(() => {}, () => {});
      };

      const addStep = (step: Omit<TaskStep, "timestamp">) => {
        const s: TaskStep = { ...step, timestamp: new Date().toISOString() };
        allSteps.push(s);
        send({ type: "step", data: s });
        persist();
      };

      try {
        send({ type: "task_id", id: task.id });

        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: taskDescription },
        ];

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          addStep({ type: "thinking", label: "Thinking..." });

          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            system: systemPrompt,
            messages,
            ...(tools.length > 0 ? { tools } : {}),
          });

          const textContent = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();

          if (textContent) {
            addStep({ type: "reasoning", label: "Reasoning", text: textContent });
          }

          if (response.stop_reason !== "tool_use") {
            addStep({ type: "done", label: "Task complete", text: textContent });
            send({ type: "complete", result: textContent, task_id: task.id });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).rpc("update_task", {
              p_task_id: task.id,
              p_user_id: user.id,
              p_status: "done",
              p_result: textContent,
              p_steps: allSteps,
            }).then(() => {}, () => {});
            controller.close();
            return;
          }

          const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          messages.push({ role: "assistant", content: response.content });
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const tu of toolUses) {
            if (tu.name === "run_ssh_command") {
              const command = (tu.input as Record<string, string>).command;
              const reason = (tu.input as Record<string, string>).reason ?? "";

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any).rpc("update_task", {
                p_task_id: task.id,
                p_user_id: user.id,
                p_status: "awaiting_confirmation",
                p_steps: allSteps,
                p_pending_ssh: {
                  command,
                  reason,
                  tool_use_id: tu.id,
                  messages: JSON.stringify([...messages]),
                },
              });

              addStep({ type: "confirm_required", label: "SSH confirmation required", command });
              send({ type: "confirm_ssh", task_id: task.id, command, reason });
              controller.close();
              return;
            }

            const label = TOOL_LABELS[tu.name] ?? tu.name;
            addStep({ type: "tool_call", label, tool: tu.name });

            const result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>, { supabase, userId: user.id, agent: agentKey as "alex" | "jeremy" | "kai" | "dana" | "marcus" | "maya", jobId: task.id });

            addStep({
              type: "tool_result",
              label: `${tu.name} complete`,
              tool: tu.name,
              text: result.slice(0, 300),
            });

            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
          }

          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "error", message: "Task reached maximum steps without completing." });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("update_task", {
          p_task_id: task.id,
          p_user_id: user.id,
          p_status: "failed",
          p_error: "Max iterations reached",
          p_steps: allSteps,
        }).then(() => {}, () => {});
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg || "An unexpected error occurred" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("update_task", {
          p_task_id: task.id,
          p_user_id: user.id,
          p_status: "failed",
          p_error: msg,
          p_steps: allSteps,
        }).then(() => {}, () => {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
