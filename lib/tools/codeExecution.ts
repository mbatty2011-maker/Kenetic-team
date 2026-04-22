import { Sandbox } from "@e2b/code-interpreter";

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  error: string | null;
  results: string;
}

export async function executeCode(
  code: string,
  language: "python" | "javascript"
): Promise<CodeExecutionResult> {
  const sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
  try {
    const execution = await sandbox.runCode(code, { language });
    return {
      stdout: execution.logs.stdout.join("\n"),
      stderr: execution.logs.stderr.join("\n"),
      error: execution.error ? `${execution.error.name}: ${execution.error.value}` : null,
      results: execution.results.map((r) => r.text ?? "").filter(Boolean).join("\n"),
    };
  } finally {
    await sandbox.kill();
  }
}
