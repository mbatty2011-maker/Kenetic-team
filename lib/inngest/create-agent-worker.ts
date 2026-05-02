import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError, RetryAfterError } from "inngest";
import { inngest } from "@/lib/inngest";
import { createAdminClient } from "@/lib/supabase/admin";
import { SYSTEM_PROMPTS } from "@/lib/agents";
import { TASK_AGENT_TOOLS, executeAgentTool } from "@/lib/agent-tools";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { getUserContext, buildUserSection } from "@/lib/tools/user-context";
import type { SupabaseClient } from "@supabase/supabase-js";

// Turns 1–19: normal execution
// Turns 20–29: continue but warn the user the job is still alive
// Turn 30: hard fail
const SOFT_LIMIT = 20;
const HARD_LIMIT = 30;

type WorkerAgentKey = "jeremy" | "kai" | "dana" | "marcus" | "maya";

type JobStep = {
  timestamp: string;
  type: "thinking" | "tool_call" | "warning" | "done" | "error";
  summary: string;
  detail?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSupabase = any;

function isRetryableAnthropicError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    const s = err.status;
    if (s === 429) return true;
    if (s !== undefined && s >= 500) return true;
    return false;
  }
  return true;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function createAgentWorker(agentKey: WorkerAgentKey) {
  const agentName = capitalize(agentKey);
  const tableName = `${agentKey}_jobs`;

  async function appendStep(
    supabase: AdminSupabase,
    jobId: string,
    userId: string,
    step: Omit<JobStep, "timestamp">
  ) {
    const full: JobStep = { ...step, timestamp: new Date().toISOString() };
    await supabase.rpc(`append_${agentKey}_job_step`, {
      p_job_id: jobId,
      p_user_id: userId,
      p_step: full,
    });
  }

  return inngest.createFunction(
    {
      id: `${agentKey}-worker`,
      name: `${agentName} Task Runner`,
      retries: 2,
      triggers: [{ event: `${agentKey}/task.requested` as `${WorkerAgentKey}/task.requested` }],
    },
    async ({ event, step }) => {
      const { jobId, userId, conversationId } = event.data as {
        jobId: string;
        userId: string;
        conversationId: string;
      };

      const supabase: AdminSupabase = createAdminClient();
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

      // ── Step 1: Setup — mark running, load history + context ─────────────────
      const { historyMessages, systemPrompt } = await step.run("setup", async () => {
        await supabase.rpc(`update_${agentKey}_job`, {
          p_job_id: jobId,
          p_user_id: userId,
          p_status: "running",
        });

        const { data: rawHistory } = await supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(20);

        const history = ((rawHistory ?? []) as { role: string; content: string }[])
          .reverse()
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        const [knowledgeBase, userContext] = await Promise.all([
          readKnowledgeBase(supabase as unknown as SupabaseClient, userId),
          getUserContext(supabase as unknown as SupabaseClient, userId),
        ]);
        const userSection = buildUserSection(userContext, "");
        const kbSection = knowledgeBase
          ? `\n\n---\n## Knowledge Base (live)\n${knowledgeBase}\n---`
          : "";

        return {
          historyMessages: history,
          systemPrompt: SYSTEM_PROMPTS[agentKey] + kbSection + userSection,
        };
      });

      // ── Step 2: Agentic loop ─────────────────────────────────────────────────
      const result = await step.run("agentic-loop", async () => {
        const allTools: Anthropic.Tool[] = TASK_AGENT_TOOLS[agentKey] ?? [];
        const messages: Anthropic.MessageParam[] = [...historyMessages];
        let finalText = "";

        for (let turn = 1; turn <= HARD_LIMIT; turn++) {
          if (turn >= SOFT_LIMIT && turn < HARD_LIMIT) {
            console.warn(`[${agentKey}-worker] job=${jobId} turn=${turn} — past soft limit, still running`);
            await appendStep(supabase, jobId, userId, {
              type: "warning",
              summary: "Taking longer than usual — still working…",
            });
          }

          if (turn === HARD_LIMIT) {
            console.error(`[${agentKey}-worker] job=${jobId} reached hard limit (${HARD_LIMIT} turns) — failing`);
            await supabase.rpc(`update_${agentKey}_job`, {
              p_job_id: jobId,
              p_user_id: userId,
              p_status: "failed",
              p_error: `Task exceeded ${HARD_LIMIT} turns without completing.`,
            });
            throw new NonRetriableError(`${agentName} job ${jobId} hit the ${HARD_LIMIT}-turn hard limit`);
          }

          await appendStep(supabase, jobId, userId, { type: "thinking", summary: "Thinking…" });

          let response: Anthropic.Message;
          try {
            response = await anthropic.messages.create({
              model: "claude-sonnet-4-6",
              max_tokens: 8192,
              system: systemPrompt,
              messages,
              tools: allTools,
            });
          } catch (err) {
            if (err instanceof Anthropic.APIError && err.status === 429) {
              const retryAfterMs = 60_000;
              await appendStep(supabase, jobId, userId, {
                type: "warning",
                summary: "Anthropic rate limit — retrying in 60s…",
              });
              throw new RetryAfterError("Anthropic rate limit", retryAfterMs);
            }
            if (!isRetryableAnthropicError(err)) {
              const msg = err instanceof Error ? err.message : String(err);
              await supabase.rpc(`update_${agentKey}_job`, {
                p_job_id: jobId,
                p_user_id: userId,
                p_status: "failed",
                p_error: msg,
              });
              throw new NonRetriableError(`Non-retryable Anthropic error: ${msg}`, { cause: err as Error });
            }
            throw err;
          }

          const textBlocks = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();

          if (textBlocks) finalText = textBlocks;

          if (response.stop_reason !== "tool_use") {
            await appendStep(supabase, jobId, userId, { type: "done", summary: "Complete", detail: finalText.slice(0, 200) });
            break;
          }

          const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          messages.push({ role: "assistant", content: response.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const tu of toolUses) {
            const input = tu.input as Record<string, unknown>;

            await appendStep(supabase, jobId, userId, {
              type: "tool_call",
              summary: tu.name.replace(/_/g, " "),
              detail: JSON.stringify(input).slice(0, 200),
            });

            const toolResult = await executeAgentTool(
              tu.name,
              input,
              { supabase: supabase as unknown as SupabaseClient, userId, agent: agentKey, conversationId, jobId }
            );
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: toolResult });
          }

          messages.push({ role: "user", content: toolResults });
        }

        return finalText;
      });

      // ── Step 3: Persist result ────────────────────────────────────────────────
      await step.run("persist-result", async () => {
        const { error: insertError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          agent_key: agentKey,
          role: "assistant",
          content: result || "(No response generated)",
        });

        if (insertError) {
          console.error(`[${agentKey}-worker] persist-result: message insert failed`, {
            jobId,
            conversationId,
            error: insertError.message,
          });
          throw new Error(`Message insert failed: ${insertError.message}`);
        }

        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        await supabase.rpc(`update_${agentKey}_job`, {
          p_job_id: jobId,
          p_user_id: userId,
          p_status: "complete",
          p_result: result,
        });

        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/conversation/${conversationId}/title`, {
            method: "POST",
          });
        } catch {
          // Non-critical — ignore
        }
      });
    }
  );
}
