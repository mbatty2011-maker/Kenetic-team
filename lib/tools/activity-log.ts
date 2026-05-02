import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentName =
  | "alex"
  | "jeremy"
  | "kai"
  | "dana"
  | "marcus"
  | "maya"
  | "computer";

export type ActivityContext = {
  supabase: SupabaseClient;
  userId: string;
  agent: AgentName;
  conversationId?: string;
  jobId?: string;
};

const MAX_FIELD_CHARS = 500;
const MAX_OUTPUT_CHARS = 2000;
const MAX_ERROR_CHARS = 2000;

function truncateValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_FIELD_CHARS
      ? `${value.slice(0, MAX_FIELD_CHARS)}…[truncated ${value.length - MAX_FIELD_CHARS} chars]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 4) return "[deep]";
  if (Array.isArray(value)) {
    const head = value.slice(0, 20).map((v) => truncateValue(v, depth + 1));
    return value.length > 20 ? [...head, `[+${value.length - 20} more]`] : head;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = truncateValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function summarizeInput(input: unknown): unknown {
  if (input === null || input === undefined) return null;
  return truncateValue(input);
}

function summarizeOutput(output: unknown): string | undefined {
  if (output === null || output === undefined) return undefined;
  const text = typeof output === "string" ? output : JSON.stringify(output);
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}…[truncated]`
    : text;
}

export async function logActivity(args: {
  ctx: ActivityContext;
  toolName: string;
  status: "started" | "succeeded" | "failed";
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs?: number;
}): Promise<void> {
  const { ctx, toolName, status, input, output, error, durationMs } = args;
  try {
    const { error: rpcError } = await ctx.supabase.rpc("log_agent_activity", {
      p_user_id: ctx.userId,
      p_agent: ctx.agent,
      p_tool_name: toolName,
      p_status: status,
      p_input_summary: input === undefined ? null : summarizeInput(input),
      p_output_summary: summarizeOutput(output) ?? null,
      p_error_message: error
        ? error.length > MAX_ERROR_CHARS
          ? `${error.slice(0, MAX_ERROR_CHARS)}…[truncated]`
          : error
        : null,
      p_conversation_id: ctx.conversationId ?? null,
      p_job_id: ctx.jobId ?? null,
      p_duration_ms: durationMs ?? null,
    });
    if (rpcError) {
      console.error("[activity-log] rpc failed", {
        toolName,
        agent: ctx.agent,
        error: rpcError.message,
      });
    }
  } catch (err) {
    console.error("[activity-log] threw", {
      toolName,
      agent: ctx.agent,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// HOF — wrap a tool handler so logging is automatic. Logging is fire-and-forget;
// it must never break tool execution.
export async function withActivityLog<T>(
  toolName: string,
  ctx: ActivityContext,
  fn: () => Promise<T>,
  formatOutput?: (result: T) => string,
  inputForLog?: unknown,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    void logActivity({
      ctx,
      toolName,
      status: "succeeded",
      input: inputForLog,
      output: formatOutput ? formatOutput(result) : undefined,
      durationMs,
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    void logActivity({
      ctx,
      toolName,
      status: "failed",
      input: inputForLog,
      error: message,
      durationMs,
    });
    throw err;
  }
}
