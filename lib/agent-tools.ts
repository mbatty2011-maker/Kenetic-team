import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentKey } from "./agents";
import { tavilySearch, formatSearchResults } from "./tools/search";
import { sendEmail, draftEmail } from "./tools/email";
import { appendToKnowledgeBase } from "./tools/knowledge";
import { executeCode } from "./tools/codeExecution";
import type { DocumentSection, XlsxSheet } from "./files/types";
import { uploadAgentFile, sanitizeFilename } from "./files/upload";

export type ToolContext = { supabase: SupabaseClient; userId: string };

// ─── Tool definitions ────────────────────────────────────────────────────────

const CREATE_FILE: Anthropic.Tool = {
  name: "create_file",
  description:
    "Generate a downloadable file (Word document, Excel spreadsheet, or PDF) uploaded to secure storage. Returns a signed download link valid for 24 hours. Use for any deliverable the user should be able to download — reports, financial models, memos, trackers, contracts, briefs.\n\nFor format \"docx\" or \"pdf\": provide content.sections (structured document body).\nFor format \"xlsx\": provide content.sheets (tabular data with headers and rows).",
  input_schema: {
    type: "object" as const,
    properties: {
      format: {
        type: "string",
        enum: ["docx", "xlsx", "pdf"],
        description: "File format to generate",
      },
      title: {
        type: "string",
        description: "Document title and base filename (no extension)",
      },
      content: {
        type: "object" as const,
        description: "Structured content. Provide sections for docx/pdf, or sheets for xlsx.",
        properties: {
          sections: {
            type: "array",
            description: "Document body sections — use for docx and pdf",
            items: {
              type: "object" as const,
              properties: {
                type: { type: "string", enum: ["heading", "paragraph", "bullet_list", "numbered_list", "table"] },
                level: { type: "integer", description: "Heading level 1, 2, or 3 — heading only" },
                text: { type: "string", description: "Text content — heading or paragraph" },
                bold: { type: "boolean", description: "Bold text — paragraph only" },
                italic: { type: "boolean", description: "Italic text — paragraph only" },
                items: { type: "array", items: { type: "string" }, description: "List items — bullet_list or numbered_list" },
                headers: { type: "array", items: { type: "string" }, description: "Column headers — table" },
                rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Table rows — table" },
              },
              required: ["type"],
            },
          },
          sheets: {
            type: "array",
            description: "Spreadsheet tabs — use for xlsx only",
            items: {
              type: "object" as const,
              properties: {
                name: { type: "string", description: "Tab name" },
                headers: { type: "array", items: { type: "string" }, description: "Column headers" },
                rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Data rows" },
              },
              required: ["name", "headers", "rows"],
            },
          },
        },
      },
    },
    required: ["format", "title", "content"],
  },
};

const WEB_SEARCH: Anthropic.Tool = {
  name: "web_search",
  description:
    "Search the web for current information — market data, competitor news, pricing, legal requirements, technical docs, or anything outside your training data.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  },
};

const SEND_EMAIL: Anthropic.Tool = {
  name: "send_email",
  description:
    "Send an email to the user. Only call this after the user has explicitly confirmed. In autonomous tasks, use draft_email instead. The user's email address is provided in the User Context section of your system prompt — always use that address as the 'to' value.",
  input_schema: {
    type: "object" as const,
    properties: {
      to: { type: "string", description: "Recipient email address — use the user's email from User Context" },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["to", "subject", "body"],
  },
};

const DRAFT_EMAIL: Anthropic.Tool = {
  name: "draft_email",
  description:
    "Create a Gmail draft. The email is NOT sent — the user reviews and sends it themselves. Use this instead of send_email for autonomous tasks. The user's email address is provided in the User Context section of your system prompt — always use that address as the 'to' value.",
  input_schema: {
    type: "object" as const,
    properties: {
      to: { type: "string", description: "Recipient email address — use the user's email from User Context" },
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["to", "subject", "body"],
  },
};

const GET_AGENT_OUTPUT: Anthropic.Tool = {
  name: "get_agent_output",
  description:
    "Retrieve recent completed outputs from another agent. Use this to access work your colleagues have already produced — financial models from Jeremy, technical specs from Kai, sales strategies from Dana, legal documents from Marcus, or marketing copy from Maya.",
  input_schema: {
    type: "object" as const,
    properties: {
      agent: {
        type: "string",
        enum: ["alex", "jeremy", "kai", "dana", "marcus", "maya"],
        description: "Which agent's outputs to retrieve",
      },
      limit: {
        type: "integer",
        description: "Number of recent outputs to retrieve (default 3, max 5)",
        minimum: 1,
        maximum: 5,
      },
    },
    required: ["agent"],
  },
};

const APPEND_TO_KB: Anthropic.Tool = {
  name: "append_to_knowledge_base",
  description:
    "Append a new section to the Knowledge Base Google Doc. Use to save research findings, meeting notes, financial data, or legal summaries permanently.",
  input_schema: {
    type: "object" as const,
    properties: {
      section_title: { type: "string", description: "Section heading (e.g. 'Market Research — April 2026')" },
      content: { type: "string", description: "Section content to append" },
    },
    required: ["section_title", "content"],
  },
};

const PROPOSE_SSH: Anthropic.Tool = {
  name: "propose_ssh_command",
  description:
    "Propose an SSH command to run on the user's server. This DOES NOT execute anything — it shows the user the command so they can run it themselves or confirm. Always use this in chat instead of executing directly.",
  input_schema: {
    type: "object" as const,
    properties: {
      command: { type: "string", description: "The exact shell command" },
      reason: { type: "string", description: "Why you want to run this" },
      expected_output: { type: "string", description: "What output you expect and how to interpret it" },
    },
    required: ["command", "reason"],
  },
};

const EXECUTE_CODE: Anthropic.Tool = {
  name: "execute_code",
  description:
    "Execute Python or JavaScript code in a secure sandbox. Use this to test solutions before recommending them, debug algorithms, run data analysis, or validate that code works.",
  input_schema: {
    type: "object" as const,
    properties: {
      code: { type: "string", description: "The code to execute" },
      language: {
        type: "string",
        enum: ["python", "javascript"],
        description: "The language to execute the code in",
      },
    },
    required: ["code", "language"],
  },
};


const RUN_SSH: Anthropic.Tool = {
  name: "run_ssh_command",
  description:
    "Execute a shell command on the user's server via SSH. The user must confirm before execution — the system will pause and ask for confirmation automatically.",
  input_schema: {
    type: "object" as const,
    properties: {
      command: { type: "string", description: "The exact shell command to run" },
      reason: { type: "string", description: "Why you need to run this" },
    },
    required: ["command", "reason"],
  },
};

// ─── Per-agent tool sets ─────────────────────────────────────────────────────

const ALL_TOOLS = [CREATE_FILE, WEB_SEARCH, SEND_EMAIL, DRAFT_EMAIL, APPEND_TO_KB, GET_AGENT_OUTPUT];

const MAYA_TOOLS = [CREATE_FILE, WEB_SEARCH, APPEND_TO_KB, GET_AGENT_OUTPUT];

// AGENT_TOOLS: used in /api/chat — all agents get all tools; Kai also gets propose_ssh + execute_code + computer use
export const AGENT_TOOLS: Partial<Record<AgentKey, Anthropic.Tool[]>> = {
  alex:   ALL_TOOLS,
  jeremy: ALL_TOOLS,
  kai:    [...ALL_TOOLS, PROPOSE_SSH, EXECUTE_CODE],
  dana:   ALL_TOOLS,
  marcus: ALL_TOOLS,
  maya:   MAYA_TOOLS,
};

// TASK_AGENT_TOOLS: used in /api/task — same but Kai gets run_ssh instead of propose_ssh
export const TASK_AGENT_TOOLS: Partial<Record<AgentKey, Anthropic.Tool[]>> = {
  alex:   ALL_TOOLS,
  jeremy: ALL_TOOLS,
  kai:    [...ALL_TOOLS, RUN_SSH, EXECUTE_CODE],
  dana:   ALL_TOOLS,
  marcus: ALL_TOOLS,
  maya:   MAYA_TOOLS,
};

// ─── Status labels for the UI ────────────────────────────────────────────────

export const TOOL_LABELS: Record<string, string> = {
  create_file:              "Generating file...",
  web_search:               "Searching the web...",
  send_email:               "Sending email...",
  draft_email:              "Drafting email...",
  append_to_knowledge_base: "Saving to knowledge base...",
  propose_ssh_command:      "Proposing Pi command...",
  run_ssh_command:          "Running command on Pi...",
  execute_code:             "Running code...",
};

// ─── Content-to-text helpers (used so file content is saved in result) ───────

function sectionsToText(sections: DocumentSection[]): string {
  return sections.map((s) => {
    switch (s.type) {
      case "heading":    return `${"#".repeat(s.level ?? 1)} ${s.text ?? ""}`;
      case "paragraph":  return s.text ?? "";
      case "bullet_list":   return (s.items ?? []).map((i) => `- ${i}`).join("\n");
      case "numbered_list": return (s.items ?? []).map((i, n) => `${n + 1}. ${i}`).join("\n");
      case "table": {
        const headers = s.headers ?? [];
        const rows = s.rows ?? [];
        const header = `| ${headers.join(" | ")} |`;
        const divider = `| ${headers.map(() => "---").join(" | ")} |`;
        const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
        return [header, divider, body].filter(Boolean).join("\n");
      }
      default: return "";
    }
  }).join("\n\n");
}

function sheetsToText(sheets: XlsxSheet[]): string {
  return sheets.map((sheet) => {
    const header = `| ${sheet.headers.join(" | ")} |`;
    const divider = `| ${sheet.headers.map(() => "---").join(" | ")} |`;
    const body = sheet.rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
    return `### ${sheet.name}\n\n${[header, divider, body].join("\n")}`;
  }).join("\n\n");
}

// ─── Tool execution ──────────────────────────────────────────────────────────

export const SSH_CONFIRMATION_TOKEN = "SSH_CONFIRMATION_REQUIRED";

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  try {
    switch (name) {
      case "create_file": {
        const format  = input.format as "docx" | "xlsx" | "pdf";
        const title   = ((input.title as string) ?? "").trim();
        const content = (input.content ?? {}) as { sections?: DocumentSection[]; sheets?: XlsxSheet[] };

        if (!format || !["docx", "xlsx", "pdf"].includes(format)) {
          return `TOOL_ERROR: Invalid format "${format}". Must be docx, xlsx, or pdf. STOP.`;
        }
        if (!title) {
          return `TOOL_ERROR: title is required. STOP.`;
        }

        try {
          let buffer: Buffer;
          let contentType: string;

          if (format === "docx") {
            const { generateDocx } = await import("./files/generators/docx");
            if (!content.sections?.length) throw new Error("sections required for docx");
            buffer = await generateDocx({ title, sections: content.sections });
            contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          } else if (format === "xlsx") {
            const { generateXlsx } = await import("./files/generators/xlsx");
            if (!content.sheets?.length) throw new Error("sheets required for xlsx");
            buffer = await generateXlsx({ title, sheets: content.sheets });
            contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          } else {
            const { generatePdf } = await import("./files/generators/pdf");
            if (!content.sections?.length) throw new Error("sections required for pdf");
            buffer = await generatePdf({ title, sections: content.sections });
            contentType = "application/pdf";
          }

          const filename = `${sanitizeFilename(title)}.${format}`;
          const { signedUrl, sizeBytes } = await uploadAgentFile(context.userId, filename, buffer, contentType);
          const kb = Math.round(sizeBytes / 1024);
          const sizeLabel = kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;

          // Fire-and-forget: save text content for get_agent_output retrieval.
          // Must NOT be awaited inside the main try — a DB failure must never
          // discard the signed URL that was already issued to the user.
          const textContent = content.sheets?.length
            ? sheetsToText(content.sheets)
            : content.sections?.length
            ? sectionsToText(content.sections)
            : "";
          if (textContent) {
            context.supabase
              .from("agent_file_contents")
              .insert({ user_id: context.userId, title, format, text_content: textContent })
              .then(({ error }) => {
                if (error) console.error("[create_file] content save failed", { title, error: error.message });
              })
              .catch((err: unknown) => {
                console.error("[create_file] content save threw", { title, error: String(err) });
              });
          }

          return `File created (${sizeLabel}). Include this exact markdown link verbatim in your response so the user can download it:\n[${title}.${format}](${signedUrl})\n\nYou MUST include the markdown link above verbatim in your response. Do not summarise or paraphrase it.`;
        } catch (fileErr) {
          const msg = fileErr instanceof Error ? fileErr.message : String(fileErr);
          console.error("[create_file] failed", { title, format, error: msg });
          return `TOOL_ERROR: File creation failed with error: "${msg}". STOP. Do not retry. Do not call create_file again. Tell the user immediately that the file could not be generated and why, then offer to paste the content as formatted text in your response.`;
        }
      }

      case "web_search": {
        const results = await tavilySearch(input.query as string, { maxResults: 4 });
        return formatSearchResults(results);
      }

      case "send_email": {
        const to = (input.to as string) || (process.env.GMAIL_FROM_ADDRESS ?? "");
        if (!to.trim()) throw new Error("Email recipient address is missing");
        await sendEmail({
          to,
          subject: input.subject as string,
          body: input.body as string,
        });
        return `Email sent to ${to} — subject: "${input.subject}"`;
      }

      case "draft_email": {
        const to = (input.to as string) || (process.env.GMAIL_FROM_ADDRESS ?? "");
        if (!to.trim()) throw new Error("Email recipient address is missing");
        await draftEmail({
          to,
          subject: input.subject as string,
          body: input.body as string,
        });
        return `Draft created in Gmail — subject: "${input.subject}". The user can review and send it from their inbox.`;
      }

      case "append_to_knowledge_base": {
        await appendToKnowledgeBase(context.supabase, context.userId, input.section_title as string, input.content as string);
        return `Section "${input.section_title}" saved to the Knowledge Base.`;
      }

      case "propose_ssh_command": {
        return (
          `SSH command proposed for review:\n` +
          `\`\`\`bash\n${input.command}\n\`\`\`\n` +
          `Reason: ${input.reason}\n` +
          (input.expected_output ? `Expected: ${input.expected_output}` : "")
        );
      }

      case "run_ssh_command": {
        throw new Error("run_ssh_command must be intercepted by the task route before reaching executeAgentTool");
      }

      case "execute_code": {
        const result = await executeCode(
          input.code as string,
          input.language as "python" | "javascript"
        );
        const parts: string[] = [];
        if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
        if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
        if (result.results) parts.push(`output:\n${result.results}`);
        if (result.error) parts.push(`error:\n${result.error}`);
        return parts.length > 0 ? parts.join("\n\n") : "(no output)";
      }

      case "get_agent_output": {
        if (!context) throw new Error("ToolContext required for get_agent_output");
        const agentKey = input.agent as string;
        const limit = Math.min(Number(input.limit ?? 3), 5);
        const validAgents = ["alex", "jeremy", "kai", "dana", "marcus", "maya"];
        if (!validAgents.includes(agentKey)) return `Unknown agent: ${agentKey}`;

        const [jobsResult, filesResult] = await Promise.all([
          context.supabase.rpc("get_recent_agent_outputs", {
            p_user_id: context.userId,
            p_agent_key: agentKey,
            p_limit: limit,
          }),
          context.supabase
            .from("agent_file_contents")
            .select("title, format, text_content, created_at")
            .eq("user_id", context.userId)
            .order("created_at", { ascending: false })
            .limit(limit),
        ]);

        if (jobsResult.error) return `Error fetching ${agentKey}'s outputs: ${jobsResult.error.message}`;

        const outputs = (jobsResult.data as Array<{ id: string; prompt: string; result: string; created_at: string }>) ?? [];
        const files = (filesResult.data as Array<{ title: string; format: string; text_content: string; created_at: string }>) ?? [];

        const sections: string[] = [];

        if (outputs.length) {
          sections.push(
            outputs.map((o, i) => {
              const date = new Date(o.created_at).toLocaleString();
              return `[Task output ${i + 1} — ${date}]\nTask: ${o.prompt}\n\n${o.result}`;
            }).join("\n\n---\n\n")
          );
        }

        if (files.length) {
          sections.push(
            files.map((f, i) => {
              const date = new Date(f.created_at).toLocaleString();
              return `[File ${i + 1} — ${f.title}.${f.format} — ${date}]\n\n${f.text_content}`;
            }).join("\n\n---\n\n")
          );
        }

        if (!sections.length) return `No completed outputs found from ${agentKey.charAt(0).toUpperCase() + agentKey.slice(1)}.`;

        return sections.join("\n\n===\n\n");
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool error (${name}): ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Non-streaming agentic loop ───────────────────────────────────────────────

export async function callAgentWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  anthropic: Anthropic,
  maxTokens = 1024,
  context?: ToolContext
): Promise<string> {
  const currentMessages = [...messages];

  const MAX_ITERATIONS = 12;
  for (let _iter = 0; _iter < MAX_ITERATIONS; _iter++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: currentMessages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    if (response.stop_reason !== "tool_use") {
      return response.content[0]?.type === "text" ? response.content[0].text : "";
    }

    currentMessages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        if (!context) throw new Error("ToolContext required for tool use but was not provided");
        const result = await executeAgentTool(block.name, block.input as Record<string, unknown>, context);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
    }

    currentMessages.push({ role: "user", content: toolResults });
  }

  throw new Error("Max agent iterations reached without a final response.");
}
