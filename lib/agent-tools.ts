import Anthropic from "@anthropic-ai/sdk";
import type { AgentKey } from "./agents";
import { tavilySearch, formatSearchResults } from "./tools/search";
import { createSpreadsheet, readSpreadsheet } from "./tools/sheets";
import { createDocument } from "./tools/gdocs";
import { sendEmail, draftEmail } from "./tools/email";
import { appendToKnowledgeBase } from "./tools/knowledge";
import { runSSHCommand } from "./tools/ssh";

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
    "Send an email to Michael (mbatty2011@gmail.com). Only call this after the user has explicitly confirmed. In autonomous tasks, use draft_email instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["subject", "body"],
  },
};

const DRAFT_EMAIL: Anthropic.Tool = {
  name: "draft_email",
  description:
    "Create a Gmail draft to Michael (mbatty2011@gmail.com). The email is NOT sent — Michael reviews and sends it himself. Use this instead of send_email for autonomous tasks.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["subject", "body"],
  },
};

const APPEND_TO_KB: Anthropic.Tool = {
  name: "append_to_knowledge_base",
  description:
    "Append a new section to the LineSkip Knowledge Base Google Doc. Use to save research findings, meeting notes, financial data, or legal summaries permanently.",
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
    "Propose an SSH command to run on the LineSkip Pi (192.168.68.92). This DOES NOT execute anything — it shows Michael the command so he can run it himself or confirm. Always use this in chat instead of executing directly.",
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

const RUN_SSH: Anthropic.Tool = {
  name: "run_ssh_command",
  description:
    "Execute a shell command on the LineSkip Pi (192.168.68.92, user: lineskippoc). Michael must confirm before execution — the system will pause and ask for confirmation automatically.",
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
// AGENT_TOOLS: used in /api/chat (chat conversations)
// TASK_AGENT_TOOLS: used in /api/task (autonomous task queue)

export const AGENT_TOOLS: Partial<Record<AgentKey, Anthropic.Tool[]>> = {
  alex:   [CREATE_SPREADSHEET, READ_SPREADSHEET, CREATE_DOCUMENT, WEB_SEARCH, SEND_EMAIL, DRAFT_EMAIL, APPEND_TO_KB],
  jeremy: [CREATE_SPREADSHEET, READ_SPREADSHEET, CREATE_DOCUMENT, WEB_SEARCH, APPEND_TO_KB],
  kai:    [CREATE_DOCUMENT, WEB_SEARCH, PROPOSE_SSH],
  dana:   [DRAFT_EMAIL, SEND_EMAIL, WEB_SEARCH, CREATE_SPREADSHEET, CREATE_DOCUMENT],
  marcus: [CREATE_DOCUMENT, WEB_SEARCH, APPEND_TO_KB],
};

export const TASK_AGENT_TOOLS: Partial<Record<AgentKey, Anthropic.Tool[]>> = {
  alex:   [CREATE_SPREADSHEET, READ_SPREADSHEET, CREATE_DOCUMENT, WEB_SEARCH, DRAFT_EMAIL, APPEND_TO_KB],
  jeremy: [CREATE_SPREADSHEET, READ_SPREADSHEET, CREATE_DOCUMENT, WEB_SEARCH, APPEND_TO_KB],
  kai:    [CREATE_DOCUMENT, WEB_SEARCH, RUN_SSH],
  dana:   [DRAFT_EMAIL, WEB_SEARCH, CREATE_SPREADSHEET, CREATE_DOCUMENT],
  marcus: [CREATE_DOCUMENT, WEB_SEARCH, APPEND_TO_KB],
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
        await sendEmail({
          to: "mbatty2011@gmail.com",
          subject: input.subject as string,
          body: input.body as string,
        });
        return `Email sent to mbatty2011@gmail.com — subject: "${input.subject}"`;
      }

      case "draft_email": {
        await draftEmail({
          to: "mbatty2011@gmail.com",
          subject: input.subject as string,
          body: input.body as string,
        });
        return `Draft created in Gmail — subject: "${input.subject}". Michael can review and send it from his inbox.`;
      }

      case "append_to_knowledge_base": {
        await appendToKnowledgeBase(input.section_title as string, input.content as string);
        return `Section "${input.section_title}" saved to the LineSkip Knowledge Base.`;
      }

      case "propose_ssh_command": {
        return (
          `SSH command proposed for Michael's review:\n` +
          `\`\`\`bash\n${input.command}\n\`\`\`\n` +
          `Reason: ${input.reason}\n` +
          (input.expected_output ? `Expected: ${input.expected_output}` : "")
        );
      }

      case "run_ssh_command": {
        // Returns a special token — the task route handles this before calling executeAgentTool
        // If somehow called directly, return the token and let the caller handle it
        return `${SSH_CONFIRMATION_TOKEN}:${JSON.stringify({ command: input.command, reason: input.reason })}`;
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
  let currentMessages = [...messages];

  while (true) {
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
}
