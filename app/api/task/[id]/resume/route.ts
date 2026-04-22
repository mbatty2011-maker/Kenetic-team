import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SYSTEM_PROMPTS } from "@/lib/agents";
import { TASK_AGENT_TOOLS, executeAgentTool, TOOL_LABELS } from "@/lib/agent-tools";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { getUserContext, buildUserSection } from "@/lib/tools/user-context";
import { runSSHCommand } from "@/lib/tools/ssh";
import type { TaskStep } from "@/app/api/task/route";

export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MAX_ITERATIONS = 10;

const TASK_SUFFIX = `

## Autonomous task mode
Continue the task. Use your tools autonomously. Produce real deliverables. When done, start with "TASK COMPLETE:" and summarize with links.
`;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const taskId = params.id;
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

  let confirmed: boolean;
  try {
    ({ confirmed } = await req.json() as { confirmed: boolean });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (task.status !== "awaiting_confirmation") {
    return NextResponse.json({ error: "Task is not awaiting confirmation" }, { status: 400 });
  }

  if (!confirmed) {
    supabase.from("tasks").update({
      status: "failed",
      error: "SSH command cancelled by user",
      updated_at: new Date().toISOString(),
    }).eq("id", taskId).then(() => {}, () => {});
    return NextResponse.json({ cancelled: true });
  }

  if (!task.pending_ssh) {
    return NextResponse.json({ error: "No pending SSH command found" }, { status: 400 });
  }

  const { command, tool_use_id, messages: messagesJSON } = task.pending_ssh;
  const allSteps: TaskStep[] = task.steps ?? [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      const persist = () => {
        supabase.from("tasks").update({ steps: allSteps, updated_at: new Date().toISOString() })
          .eq("id", taskId).then(() => {}, () => {});
      };

      const addStep = (step: Omit<TaskStep, "timestamp">) => {
        const s: TaskStep = { ...step, timestamp: new Date().toISOString() };
        allSteps.push(s);
        send({ type: "step", data: s });
        persist();
      };

      try {
        supabase.from("tasks").update({ status: "running", pending_ssh: null })
          .eq("id", taskId).then(() => {}, () => {});
        send({ type: "resumed" });

        addStep({ type: "tool_call", label: "Running SSH command...", tool: "run_ssh_command", command });

        let sshResult: string;
        try {
          sshResult = await runSSHCommand(command);
        } catch (err) {
          sshResult = `SSH error: ${err instanceof Error ? err.message : String(err)}`;
        }

        addStep({ type: "tool_result", label: "SSH result", tool: "run_ssh_command", text: sshResult.slice(0, 300) });

        // Rebuild messages from snapshot
        let messages: Anthropic.MessageParam[];
        try {
          messages = JSON.parse(messagesJSON);
        } catch {
          send({ type: "error", message: "Failed to restore task state" });
          supabase.from("tasks").update({ status: "failed", error: "Invalid message snapshot", steps: allSteps })
            .eq("id", taskId).then(() => {}, () => {});
          controller.close();
          return;
        }

        messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id, content: sshResult }],
        });

        const [knowledgeBase, userContext] = await Promise.all([
          readKnowledgeBase(supabase, user.id),
          getUserContext(supabase, user.id),
        ]);
        const userSection = buildUserSection(userContext, user.email ?? "");
        const systemPrompt = [
          SYSTEM_PROMPTS[task.agent_key as keyof typeof SYSTEM_PROMPTS],
          knowledgeBase ? `---\n## Knowledge Base\n${knowledgeBase}\n---` : "",
          userSection,
          TASK_SUFFIX,
        ].filter(Boolean).join("\n\n");

        const tools = TASK_AGENT_TOOLS[task.agent_key as keyof typeof TASK_AGENT_TOOLS] ?? [];

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
            send({ type: "complete", result: textContent, task_id: taskId });
            supabase.from("tasks").update({
              status: "done",
              result: textContent,
              steps: allSteps,
              updated_at: new Date().toISOString(),
            }).eq("id", taskId).then(() => {}, () => {});
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
              const cmd = (tu.input as Record<string, string>).command;
              const reason = (tu.input as Record<string, string>).reason ?? "";

              await supabase.from("tasks").update({
                status: "awaiting_confirmation",
                steps: allSteps,
                pending_ssh: {
                  command: cmd,
                  reason,
                  tool_use_id: tu.id,
                  messages: JSON.stringify([...messages]),
                },
                updated_at: new Date().toISOString(),
              }).eq("id", taskId);

              addStep({ type: "confirm_required", label: "SSH confirmation required", command: cmd });
              send({ type: "confirm_ssh", task_id: taskId, command: cmd, reason });
              controller.close();
              return;
            }

            const label = TOOL_LABELS[tu.name] ?? tu.name;
            addStep({ type: "tool_call", label, tool: tu.name });

            const result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>, { supabase, userId: user.id });

            addStep({ type: "tool_result", label: `${tu.name} complete`, tool: tu.name, text: result.slice(0, 300) });
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
          }

          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "error", message: "Task reached maximum steps." });
        supabase.from("tasks").update({ status: "failed", error: "Max iterations", steps: allSteps })
          .eq("id", taskId).then(() => {}, () => {});
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
        supabase.from("tasks").update({ status: "failed", error: msg, steps: allSteps })
          .eq("id", taskId).then(() => {}, () => {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
