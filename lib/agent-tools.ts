import Anthropic from "@anthropic-ai/sdk";
import type { AgentKey } from "./agents";
import { tavilySearch, formatSearchResults } from "./tools/search";
import { createSpreadsheet, readSpreadsheet } from "./tools/sheets";
import { createDocument } from "./tools/gdocs";
import { sendEmail, draftEmail } from "./tools/email";
import { appendToKnowledgeBase } from "./tools/knowledge";
import { executeCode } from "./tools/codeExecution";
import { writeFile } from "./tools/fileSystem";

// ─── Tool definitions ────────────────────────────────────────────────────────

const CREATE_SPREADSHEET: Anthropic.Tool = {
  name: "create_spreadsheet",
  description:
    "Create a new Google Spreadsheet with structured data. Returns the URL. Use for financial models, budgets, trackers, contact lists, or any tabular data.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      sheets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Tab name" },
            data: {
              type: "array",
              description: "2D array — first row is headers",
              items: { type: "array", items: { type: "string" } },
            },
          },
          required: ["name", "data"],
        },
      },
    },
    required: ["title", "sheets"],
  },
};

const READ_SPREADSHEET: Anthropic.Tool = {
  name: "read_spreadsheet",
  description:
    "Read data from an existing Google Spreadsheet by its URL or ID. Returns the cell data as tab-separated text.",
  input_schema: {
    type: "object" as const,
    properties: {
      spreadsheet_id_or_url: { type: "string", description: "Spreadsheet URL or ID" },
      range: { type: "string", description: "A1 notation range, e.g. 'Sheet1!A1:D20'. Defaults to A1:Z100." },
    },
    required: ["spreadsheet_id_or_url"],
  },
};

const CREATE_DOCUMENT: Anthropic.Tool = {
  name: "create_document",
  description:
    "Create a new Google Doc. Returns the URL. Use for reports, memos, letters, briefs, contract templates, or any written artifact.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      content: { type: "string", description: "Full document text (use newlines for structure)" },
    },
    required: ["title", "content"],
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

const WRITE_FILE: Anthropic.Tool = {
  name: "write_file",
  description:
    "Write content to a file in the project directory. Use this to create pages, components, styles, or any code file. Path is relative to the project root (e.g. 'app/landing/page.tsx'). Creates any missing directories automatically.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "Relative file path from project root, e.g. 'app/landing/page.tsx'" },
      content: { type: "string", description: "Full file content to write" },
    },
    required: ["path", "content"],
  },
};

// Computer Use tools — require a running container (see COMPUTER_USE_SETUP.md)
const COMPUTER_USE_COMPUTER: Anthropic.Tool = {
  name: "computer",
  description: "Control a computer with mouse/keyboard and take screenshots. Requires a running container with a display — see COMPUTER_USE_SETUP.md.",
  input_schema: {
    type: "object" as const,
    properties: {
      action: { type: "string", description: "The action to perform (screenshot, click, type, etc.)" },
      coordinate: { type: "array", items: { type: "number" }, description: "[x, y] coordinate for click actions" },
      text: { type: "string", description: "Text to type" },
    },
    required: ["action"],
  },
};

const COMPUTER_USE_TEXT_EDITOR: Anthropic.Tool = {
  name: "text_editor",
  description: "View and edit files on the computer. Requires a running container — see COMPUTER_USE_SETUP.md.",
  input_schema: {
    type: "object" as const,
    properties: {
      command: { type: "string", enum: ["view", "create", "str_replace", "insert", "undo_edit"] },
      path: { type: "string" },
      file_text: { type: "string" },
      old_str: { type: "string" },
      new_str: { type: "string" },
      insert_line: { type: "number" },
      new_file: { type: "string" },
    },
    required: ["command", "path"],
  },
};

const COMPUTER_USE_BASH: Anthropic.Tool = {
  name: "bash",
  description: "Run bash commands on the computer. Requires a running container — see COMPUTER_USE_SETUP.md.",
  input_schema: {
    type: "object" as const,
    properties: {
      command: { type: "string", description: "The bash command to run" },
      restart: { type: "boolean", description: "Restart the shell session" },
    },
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

const ALL_TOOLS = [CREATE_SPREADSHEET, READ_SPREADSHEET, CREATE_DOCUMENT, WEB_SEARCH, SEND_EMAIL, DRAFT_EMAIL, APPEND_TO_KB];

const KAI_COMPUTER_USE = [COMPUTER_USE_COMPUTER, COMPUTER_USE_TEXT_EDITOR, COMPUTER_USE_BASH];

// AGENT_TOOLS: used in /api/chat — all agents get all tools; Kai also gets propose_ssh + execute_code + computer use
export const AGENT_TOOLS: Partial<Record<AgentKey, Anthropic.Tool[]>> = {
  alex:   ALL_TOOLS,
  jeremy: ALL_TOOLS,
  kai:    [...ALL_TOOLS, PROPOSE_SSH, EXECUTE_CODE],
  dana:   ALL_TOOLS,
  marcus: ALL_TOOLS,
};

// TASK_AGENT_TOOLS: used in /api/task — same but Kai gets run_ssh instead of propose_ssh
export const TASK_AGENT_TOOLS: Partial<Record<AgentKey, Anthropic.Tool[]>> = {
  alex:   ALL_TOOLS,
  jeremy: ALL_TOOLS,
  kai:    [...ALL_TOOLS, RUN_SSH, EXECUTE_CODE],
  dana:   ALL_TOOLS,
  marcus: ALL_TOOLS,
};

// ─── Status labels for the UI ────────────────────────────────────────────────

export const TOOL_LABELS: Record<string, string> = {
  create_spreadsheet:       "Building spreadsheet...",
  read_spreadsheet:         "Reading spreadsheet...",
  create_document:          "Creating document...",
  web_search:               "Searching the web...",
  send_email:               "Sending email...",
  draft_email:              "Drafting email...",
  append_to_knowledge_base: "Saving to knowledge base...",
  propose_ssh_command:      "Proposing Pi command...",
  run_ssh_command:          "Running command on Pi...",
  execute_code:             "Running code...",
  write_file:               "Writing file...",
  computer:                 "Using computer...",
  text_editor:              "Editing file...",
  bash:                     "Running shell command...",
};

// ─── Tool execution ──────────────────────────────────────────────────────────

export const SSH_CONFIRMATION_TOKEN = "SSH_CONFIRMATION_REQUIRED";

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "create_spreadsheet": {
        const r = await createSpreadsheet(
          input.title as string,
          input.sheets as { name: string; data: (string | number)[][] }[]
        );
        return `Spreadsheet created.\nTitle: ${r.title}\nURL: ${r.url}`;
      }

      case "read_spreadsheet": {
        const data = await readSpreadsheet(
          input.spreadsheet_id_or_url as string,
          input.range as string | undefined
        );
        return data;
      }

      case "create_document": {
        const r = await createDocument(input.title as string, input.content as string);
        return `Document created.\nTitle: ${r.title}\nURL: ${r.url}`;
      }

      case "web_search": {
        const results = await tavilySearch(input.query as string, { maxResults: 4 });
        return formatSearchResults(results);
      }

      case "send_email": {
        const to = (input.to as string) || (process.env.GMAIL_FROM_ADDRESS ?? "");
        await sendEmail({
          to,
          subject: input.subject as string,
          body: input.body as string,
        });
        return `Email sent to ${to} — subject: "${input.subject}"`;
      }

      case "draft_email": {
        const to = (input.to as string) || (process.env.GMAIL_FROM_ADDRESS ?? "");
        await draftEmail({
          to,
          subject: input.subject as string,
          body: input.body as string,
        });
        return `Draft created in Gmail — subject: "${input.subject}". The user can review and send it from their inbox.`;
      }

      case "append_to_knowledge_base": {
        await appendToKnowledgeBase(input.section_title as string, input.content as string);
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

      case "write_file": {
        const filePath = input.path as string;
        const content = input.content as string;
        const written = await writeFile(filePath, content);
        return `File written: ${written}`;
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

      case "computer":
      case "text_editor":
      case "bash": {
        return `Computer Use requires a running container. See COMPUTER_USE_SETUP.md for setup instructions.`;
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
  maxTokens = 1024
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
        const result = await executeAgentTool(block.name, block.input as Record<string, unknown>);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
    }

    currentMessages.push({ role: "user", content: toolResults });
  }

  throw new Error("Max agent iterations reached without a final response.");
}
