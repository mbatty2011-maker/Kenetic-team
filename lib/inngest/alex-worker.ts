import Anthropic from "@anthropic-ai/sdk";
import { NonRetriableError, RetryAfterError } from "inngest";
import { inngest } from "@/lib/inngest";
import { createAdminClient } from "@/lib/supabase/admin";
import { SYSTEM_PROMPTS } from "@/lib/agents";
import { AGENT_TOOLS, executeAgentTool, callAgentWithTools } from "@/lib/agent-tools";
import { readKnowledgeBase } from "@/lib/tools/knowledge";
import { getUserContext, buildUserSection } from "@/lib/tools/user-context";
import type { SupabaseClient } from "@supabase/supabase-js";

// Turns 1–19: normal execution
// Turns 20–29: continue but append a warning step so the user sees the job is still alive
// Turn 30: hard fail — mark job failed and stop
const SOFT_LIMIT = 20;
const HARD_LIMIT = 30;

const SPECIALIST_DESCRIPTIONS: Record<string, string> = {
  jeremy: "Consult Jeremy (CFO) for financial analysis, unit economics, pricing strategy, burn rate, runway, fundraising math, or financial modeling.",
  kai:    "Consult Kai (CTO) for technical implementation, code architecture, debugging, infrastructure, web dev, or any engineering question.",
  dana:   "Consult Dana (Head of Sales) for sales strategy, outreach copy, competitive positioning, deal structure, or partnership sequencing.",
  marcus: "Consult Marcus (General Counsel) for legal questions, contracts, IP, compliance, NDA drafting, or regulatory matters.",
  maya:   "Consult Maya (Head of Marketing) for positioning copy, pitch narrative, one-pager copy, email outreach drafts, social post drafts, announcement copy, website copy, or any text-based marketing deliverable. Not for design, ad management, or publishing.",
};

const SPECIALIST_TOOLS: Anthropic.Tool[] = Object.entries(SPECIALIST_DESCRIPTIONS).map(
  ([key, description]) => ({
    name: `ask_${key}` as string,
    description,
    input_schema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "Your specific question for this specialist" },
      },
      required: ["question"],
    },
  })
);

// Extended system prompt: Alex's base prompt + specialist tool guidance
const ALEX_WORKER_SYSTEM = `${SYSTEM_PROMPTS.alex}

## Specialist tools
You have direct access to your team. Call them when their domain is relevant.
- ask_jeremy: financial analysis, pricing, unit economics, fundraising
- ask_kai: technical implementation, code, architecture, debugging
- ask_dana: sales strategy, outreach, competitive positioning, deal structure
- ask_marcus: legal, contracts, IP, compliance, regulatory questions
- ask_maya: positioning copy, pitch narrative, marketing briefs, email drafts

CRITICAL RULES:
1. Each specialist can only be consulted ONCE per task. Once they respond, their tool is gone.
2. After ALL required specialists have responded, write the complete final deliverable immediately in your next response — do not ask follow-up questions, do not consult anyone again.
3. Your final response must be the actual deliverable (the plan, the document, the analysis) — not a description of what you will do.`;

type JobStep = {
  timestamp: string;
  type: "thinking" | "tool_call" | "specialist" | "specialist_done" | "warning" | "done" | "error";
  summary: string;
  detail?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSupabase = any;

async function appendStep(supabase: AdminSupabase, jobId: string, userId: string, step: Omit<JobStep, "timestamp">) {
  const full: JobStep = { ...step, timestamp: new Date().toISOString() };
  await supabase.rpc("append_alex_job_step", {
    p_job_id: jobId,
    p_user_id: userId,
    p_step: full,
  });
}

function isRetryableAnthropicError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    const s = err.status;
    // Retry on 429 (rate limit) and 5xx (server errors). Do NOT retry on other
    // 4xx errors (400 bad request, 401 auth, 403 forbidden, 451 content policy)
    // — those will just fail again and waste tokens.
    if (s === 429) return true;
    if (s !== undefined && s >= 500) return true;
    return false;
  }
  // Network errors (no status) are always retryable
  return true;
}

export const alexWorker = inngest.createFunction(
  {
    id: "alex-worker",
    name: "Alex Task Runner",
    retries: 2,
    triggers: [{ event: "alex/task.requested" }],
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
      await supabase.rpc("update_alex_job", {
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
        systemPrompt: ALEX_WORKER_SYSTEM + kbSection + userSection,
      };
    });

    // ── Step 2: Agentic loop ─────────────────────────────────────────────────
    const result = await step.run("agentic-loop", async () => {
      // Specialist tools are single-use: removed after first consultation so Alex
      // can't loop back asking the same specialist for more detail.
      let availableSpecialistTools = [...SPECIALIST_TOOLS];

      const messages: Anthropic.MessageParam[] = [...historyMessages];
      let finalText = "";
      // Hard wall: bail out 50s before Vercel's 300s maxDuration to avoid mid-turn kill
      const loopDeadline = Date.now() + 240_000;

      for (let turn = 1; turn <= HARD_LIMIT; turn++) {
        if (Date.now() > loopDeadline) {
          console.warn(`[alex-worker] job=${jobId} — deadline hit at turn ${turn}, finishing early`);
          await appendStep(supabase, jobId, userId, {
            type: "warning",
            summary: "Reached time limit — wrapping up with what I have.",
          });
          break;
        }
        // Warn the user on turns 20–29 so they know the job is still running
        if (turn >= SOFT_LIMIT && turn < HARD_LIMIT) {
          console.warn(`[alex-worker] job=${jobId} turn=${turn} — past soft limit, still running`);
          await appendStep(supabase, jobId, userId, {
            type: "warning",
            summary: "Taking longer than usual — still working…",
          });
        }

        // Hard fail at turn 30
        if (turn === HARD_LIMIT) {
          console.error(`[alex-worker] job=${jobId} reached hard limit (${HARD_LIMIT} turns) — failing`);
          await supabase.rpc("update_alex_job", {
            p_job_id: jobId,
            p_user_id: userId,
            p_status: "failed",
            p_error: `Task exceeded ${HARD_LIMIT} turns without completing.`,
          });
          throw new NonRetriableError(`Alex job ${jobId} hit the ${HARD_LIMIT}-turn hard limit`);
        }

        await appendStep(supabase, jobId, userId, { type: "thinking", summary: "Thinking…" });

        let response: Anthropic.Message;
        try {
          response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            system: systemPrompt,
            messages,
            tools: [...(AGENT_TOOLS.alex ?? []), ...availableSpecialistTools],
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
            await supabase.rpc("update_alex_job", {
              p_job_id: jobId,
              p_user_id: userId,
              p_status: "failed",
              p_error: msg,
            });
            throw new NonRetriableError(`Non-retryable Anthropic error: ${msg}`, { cause: err as Error });
          }
          throw err; // retryable (5xx, network) — let Inngest retry the step
        }

        const textBlocks = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        if (textBlocks) finalText = textBlocks;

        // Task complete
        if (response.stop_reason !== "tool_use") {
          await appendStep(supabase, jobId, userId, { type: "done", summary: "Complete", detail: finalText.slice(0, 200) });
          break;
        }

        // Handle tool calls
        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );
        messages.push({ role: "assistant", content: response.content });

        // Partition into specialist calls (run in parallel) and regular tool calls
        const specialistUses: Anthropic.ToolUseBlock[] = [];
        const regularUses: Anthropic.ToolUseBlock[] = [];

        for (const tu of toolUses) {
          const specialistKey = tu.name.startsWith("ask_") ? tu.name.slice(4) : null;
          if (specialistKey && ["jeremy", "kai", "dana", "marcus", "maya"].includes(specialistKey)) {
            specialistUses.push(tu);
            // Remove each called specialist immediately — one consultation only
            availableSpecialistTools = availableSpecialistTools.filter(t => t.name !== tu.name);
          } else {
            regularUses.push(tu);
          }
        }

        // Run ALL specialist calls in parallel so 5 specialists take ~40s, not ~200s
        const specialistResultMap = new Map<string, string>();
        if (specialistUses.length > 0) {
          await Promise.all(
            specialistUses.map(async (tu) => {
              const specialistKey = tu.name.slice(4) as "jeremy" | "kai" | "dana" | "marcus" | "maya";
              const question = (tu.input as Record<string, unknown>).question as string ?? "";

              await appendStep(supabase, jobId, userId, {
                type: "specialist",
                summary: `Asking ${capitalize(specialistKey)}…`,
                detail: question,
              });

              let specialistResponse: string;
              try {
                const agentBrief = `${SYSTEM_PROMPTS[specialistKey]}

Alex (Chief of Staff) is consulting you on this specific question:
"${question}"

Be direct, specific, and actionable. Produce actual content and numbers — not a description of what you will do. Alex will synthesize your input into the final deliverable.`;

                specialistResponse = await callAgentWithTools(
                  agentBrief,
                  [{ role: "user", content: question }],
                  AGENT_TOOLS[specialistKey] ?? [],
                  anthropic,
                  4096,
                  { supabase: supabase as unknown as SupabaseClient, userId }
                );
              } catch {
                specialistResponse = `[${capitalize(specialistKey)} encountered an error and could not respond]`;
              }

              await appendStep(supabase, jobId, userId, {
                type: "specialist_done",
                summary: `${capitalize(specialistKey)} responded`,
                detail: specialistResponse.slice(0, 300),
              });

              specialistResultMap.set(tu.id, specialistResponse);
            })
          );
        }

        // Run regular (non-specialist) tools sequentially
        const regularResultMap = new Map<string, string>();
        for (const tu of regularUses) {
          const input = tu.input as Record<string, unknown>;
          await appendStep(supabase, jobId, userId, {
            type: "tool_call",
            summary: tu.name.replace(/_/g, " "),
            detail: JSON.stringify(input).slice(0, 200),
          });
          const toolResult = await executeAgentTool(
            tu.name,
            input,
            { supabase: supabase as unknown as SupabaseClient, userId }
          );
          regularResultMap.set(tu.id, toolResult);
        }

        // Merge results preserving original tool-use order (required by Anthropic API)
        const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => ({
          type: "tool_result" as const,
          tool_use_id: tu.id,
          content: specialistResultMap.get(tu.id) ?? regularResultMap.get(tu.id) ?? "",
        }));

        messages.push({ role: "user", content: toolResults });
      }

      return finalText;
    });

    // ── Step 3: Persist result ────────────────────────────────────────────────
    await step.run("persist-result", async () => {
      // Save Alex's final message to the messages table for conversation history.
      // Specialist responses are intentionally NOT saved here — they live only
      // in alex_jobs.steps to keep the conversation thread clean.
      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        agent_key: "alex",
        role: "assistant",
        content: result || "(No response generated)",
      });

      if (insertError) {
        console.error("[alex-worker] persist-result: message insert failed", {
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

      await supabase.rpc("update_alex_job", {
        p_job_id: jobId,
        p_user_id: userId,
        p_status: "complete",
        p_result: result,
      });

      // Generate conversation title if this is the first exchange
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

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
