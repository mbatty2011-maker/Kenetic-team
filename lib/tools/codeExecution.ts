import { Sandbox } from "@e2b/code-interpreter";

const DEFAULT_EXEC_TIMEOUT_MS = 60_000;
const SANDBOX_LIFETIME_MS = 120_000;
const MAX_CODE_BYTES = 50_000;

export interface CodeArtifact {
  kind: "png" | "jpeg" | "svg" | "html" | "pdf";
  size: number;
}

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  error: string | null;
  results: string;
  artifacts: CodeArtifact[];
  durationMs: number;
}

export async function executeCode(
  code: string,
  language: "python" | "javascript",
  opts: { timeoutMs?: number } = {}
): Promise<CodeExecutionResult> {
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY is not configured. Set it in Vercel → Environment Variables.");
  }
  if (!code?.trim()) throw new Error("execute_code: empty code body");
  if (code.length > MAX_CODE_BYTES) {
    throw new Error(`execute_code: code body too large (max ${MAX_CODE_BYTES} chars)`);
  }

  const startedAt = Date.now();
  const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: SANDBOX_LIFETIME_MS,
  });
  try {
    const execution = await sandbox.runCode(code, {
      language,
      timeoutMs: opts.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS,
    });

    const artifacts: CodeArtifact[] = [];
    for (const r of execution.results) {
      if (r.png) artifacts.push({ kind: "png", size: r.png.length });
      else if (r.jpeg) artifacts.push({ kind: "jpeg", size: r.jpeg.length });
      else if (r.svg) artifacts.push({ kind: "svg", size: r.svg.length });
      else if (r.html) artifacts.push({ kind: "html", size: r.html.length });
      else if (r.pdf) artifacts.push({ kind: "pdf", size: r.pdf.length });
    }

    const textResults = execution.results
      .map((r) => r.text ?? "")
      .filter(Boolean)
      .join("\n");

    const errorString = execution.error
      ? `${execution.error.name}: ${execution.error.value}${
          execution.error.traceback ? `\n${execution.error.traceback}` : ""
        }`
      : null;

    return {
      stdout: execution.logs.stdout.join("\n"),
      stderr: execution.logs.stderr.join("\n"),
      error: errorString,
      results: textResults,
      artifacts,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    try {
      await sandbox.kill();
    } catch (killErr) {
      console.warn("[execute_code] sandbox.kill() failed", { error: String(killErr) });
    }
  }
}
