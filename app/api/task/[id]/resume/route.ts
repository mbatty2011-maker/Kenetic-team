import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SYSTEM_PROMPTS } from "@/lib/agents";
import { TASK_AGENT_TOOLS, executeAgentTool, TOOL_LABELS } from "@/lib/agent-tools";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { runSSHCommand } from "@/lib/tools/ssh";
import type { TaskStep } from "@/app/api/task/route";

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

  const { confirmed } = await req.json() as { confirmed: boolean };

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
    await supabase.from("tasks").update({
      status: "failed",
      error: "SSH command cancelled by user",
      updated_at: new Date().toISOString(),
    }).eq("id", taskId);
    return NextResponse.json({ cancelled: true });
  }

  const { command, tool_use_id, messages: messagesJSON } = task.pending_ssh;
  const allSteps: TaskStep[] = task.steps ?? [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      const addStep = async (step: Omit<TaskStep, "timestamp">) => {
        const s: TaskStep = { ...step, timestamp: new Date().toISOString() };
        allSteps.push(s);
        send({ type: "step", data: s });
        await supabase.from("tasks").update({ steps: allSteps, updated_at: new Date().toISOString() }).eq("id", taskId);
      };

      try {
        await supabase.from("tasks").update({ status: "running", pending_ssh: null }).eq("id", taskId);
        send({ type: "resumed" });

        await addStep({ type: "tool_call", label: "Running SSH command...", tool: "run_ssh_command", command });

        let sshResult: string;
        try {
          sshResult = await runSSHCommand(command);
        } catch (err) {
          sshResult = `SSH error: ${err instanceof Error ? err.message : String(err)}`;
        }

        await addStep({ type: "tool_result", label: "SSH result", tool: "run_ssh_command", text: sshResult.slice(0, 300) });

        // Rebuild messages from snapshot
        const messages: Anthropic.MessageParam[] = JSON.parse(messagesJSON);
        messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id, content: sshResult }],
        });

        const knowledgeBase = await readKnowledgeBase();
        const systemPrompt = [
          SYSTEM_PROMPTS[task.agent_key as keyof typeof SYSTEM_PROMPTS],
          knowledgeBase ? `---\n## LineSkip Knowledge Base\n${knowledgeBase}\n---` : "",
          TASK_SUFFIX,
        ].filter(Boolean).join("\n\n");

        const tools = TASK_AGENT_TOOLS[task.agent_key as keyof typeof TASK_AGENT_TOOLS] ?? [];

        for (let i = 0; i < MAX_ITERATIONS; i++) {
          await addStep({ type: "thinking", label: "Thinking..." });

          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
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
            await addStep({ type: "reasoning", label: "Reasoning", text: textContent });
          }

          if (response.stop_reason !== "tool_use") {
            await addStep({ type: "done", label: "Task complete", text: textContent });
            send({ type: "complete", result: textContent, task_id: taskId });

            await supabase.from("tasks").update({
              status: "done",
              result: textContent,
              steps: allSteps,
              updated_at: new Date().toISOString(),
            }).eq("id", taskId);

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

              await addStep({ type: "confirm_required", label: "SSH confirmation required", command: cmd });
              send({ type: "confirm_ssh", task_id: taskId, command: cmd, reason });
              controller.close();
              return;
            }

            const label = TOOL_LABELS[tu.name] ?? tu.name;
            await addStep({ type: "tool_call", label, tool: tu.name });

            const result = await executeAgentTool(tu.name, tu.input as Record<string, unknown>);

            await addStep({ type: "tool_result", label: `${tu.name} complete`, tool: tu.name, text: result.slice(0, 300) });
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
          }

          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "error", message: "Task reached maximum steps." });
        await supabase.from("tasks").update({ status: "failed", error: "Max iterations", steps: allSteps }).eq("id", taskId);
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
        await supabase.from("tasks").update({ status: "failed", error: msg, steps: allSteps }).eq("id", taskId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
