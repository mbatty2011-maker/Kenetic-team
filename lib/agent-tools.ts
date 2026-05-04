import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentKey } from "./agents";
import { tavilySearch, formatSearchResults } from "./tools/search";
import { sendEmail, draftEmail } from "./tools/email";
import { appendToKnowledgeBase } from "./tools/knowledge";
import { upsertBrandProfile, BRAND_FIELDS } from "./tools/brand";
import { executeCode } from "./tools/codeExecution";
import type { DocumentSection, XlsxSheet } from "./files/types";
import { uploadAgentFile, sanitizeFilename } from "./files/upload";
import { getUserTier } from "./tier";
import { logActivity, type AgentName, type ActivityContext } from "./tools/activity-log";
import * as gmail from "./tools/gmail";
import * as calendar from "./tools/calendar";
import { GoogleNotConnectedError } from "./tools/google-auth";
import { StripeNotConnectedError } from "./tools/stripe-auth";
import {
  getStripeFinancialSummary,
  getStripeMetric,
  type StripeMetric,
} from "./tools/stripe-data";
import {
  createSpreadsheet,
  readSpreadsheet,
  appendToSpreadsheet,
  updateSpreadsheetRange,
} from "./tools/sheets";
import {
  buildPnlSnapshot,
  formatPnlSnapshotResult,
  type PnlDelivery,
} from "./tools/financial";
import { runDesktopTool } from "./tools/desktopRun";
import { checkDesktopSessionLimit } from "./tools/desktopRateLimit";
import * as crm from "./tools/crm";
import { lookupLinkedInProfile, formatLinkedInProfile } from "./tools/linkedin";
import * as github from "./tools/github";
import * as legal from "./tools/legal";

export type ToolContext = {
  supabase: SupabaseClient;
  userId: string;
  agent?: AgentName;
  conversationId?: string;
  jobId?: string;
};

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
      force_send: { type: "boolean", description: "Dana-only: override the do_not_contact CRM block. Set true only when the user explicitly says to email a DNC contact anyway." },
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
      force_send: { type: "boolean", description: "Dana-only: override the do_not_contact CRM block. Set true only when the user explicitly says to email a DNC contact anyway." },
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

const UPDATE_BRAND_PROFILE: Anthropic.Tool = {
  name: "update_brand_profile",
  description:
    "Persist or update the user's brand profile fields. Each field is independently updatable — only include the fields you want to set or replace. Use after onboarding discovery, or whenever the user clarifies positioning. Do NOT call this just to acknowledge; only call when you have new content to save.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand_voice:        { type: "string", description: "Personality and tone — how the brand sounds (e.g. 'direct, dry, no jargon')" },
      target_audience:    { type: "string", description: "Who the brand is talking to — demographic + psychographic" },
      value_propositions: { type: "string", description: "Why customers should care — core benefit messaging" },
      mission:            { type: "string", description: "What the company is trying to do in the world" },
      taglines:           { type: "string", description: "Short repeatable lines used across surfaces" },
      dos_and_donts:      { type: "string", description: "Brand language rules — what to always do, what to avoid" },
    },
  },
};

const EXECUTE_CODE: Anthropic.Tool = {
  name: "execute_code",
  description:
    "Execute Python or JavaScript in a fresh ephemeral sandbox to verify hypotheses, test snippets, run quick data analysis, parse output formats, or compute results. Each call gets a clean environment — no state persists between calls.\n\nPython: numpy, pandas, scipy, matplotlib, requests, beautifulsoup4, sympy, scikit-learn are pre-installed. Use Python by default for math, data, parsing, and ML work.\nJavaScript: Node 20 with the standard library. Use for JSON munging, regex experiments, or testing snippets you intend to ship in this codebase.\n\nHard limits: 60s execution timeout, 50,000 chars of code per call. Always prefer execute_code over speculation when verifying behavior.",
  input_schema: {
    type: "object" as const,
    properties: {
      code: {
        type: "string",
        description: "The exact code to execute. Must be self-contained — no state carries over between calls.",
      },
      language: {
        type: "string",
        enum: ["python", "javascript"],
        description: "python (default for data/math/ML) or javascript (default for JSON/regex/Node experiments)",
      },
    },
    required: ["code", "language"],
  },
};

// ─── GitHub tools (read-only) ────────────────────────────────────────────────

const GITHUB_SEARCH_REPOS: Anthropic.Tool = {
  name: "github_search_repos",
  description:
    "Search public GitHub repositories. Returns name, owner, description, stars, language, license, and URL. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "GitHub search query (e.g. 'topic:react language:typescript stars:>1000')" },
      per_page: { type: "integer", description: "Max results (default 10, max 30)" },
    },
    required: ["query"],
  },
};

const GITHUB_GET_REPO: Anthropic.Tool = {
  name: "github_get_repo",
  description:
    "Fetch a repo's metadata: description, default branch, language, license, stars, topics, homepage, last push. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
    },
    required: ["owner", "repo"],
  },
};

const GITHUB_READ_FILE: Anthropic.Tool = {
  name: "github_read_file",
  description:
    "Read the contents of a single file from a GitHub repo. Returns up to 200,000 chars (truncated if larger). Use this BEFORE recommending changes against a file the user references. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      path: { type: "string", description: "Path relative to repo root (e.g. 'src/index.ts')" },
      ref: { type: "string", description: "Branch, tag, or commit SHA (default: repo's default branch)" },
    },
    required: ["owner", "repo", "path"],
  },
};

const GITHUB_LIST_DIR: Anthropic.Tool = {
  name: "github_list_directory",
  description:
    "List files and subdirectories at a path inside a GitHub repo. Use to explore repo structure before reading files. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      path: { type: "string", description: "Directory path relative to repo root. Empty string = repo root." },
      ref: { type: "string", description: "Branch, tag, or commit SHA (default: repo's default branch)" },
    },
    required: ["owner", "repo", "path"],
  },
};

const GITHUB_SEARCH_CODE: Anthropic.Tool = {
  name: "github_search_code",
  description:
    "Search code across GitHub. Strongly recommend including a `repo:` or `org:` qualifier to scope (e.g. 'useState repo:vercel/next.js'). Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "GitHub code search query — include repo:owner/name or org:owner to scope" },
      per_page: { type: "integer", description: "Max results (default 10, max 30)" },
    },
    required: ["query"],
  },
};

const GITHUB_LIST_COMMITS: Anthropic.Tool = {
  name: "github_list_commits",
  description:
    "List recent commits in a repo, optionally scoped to a path. Returns SHA, author, date, and first line of commit message. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      path: { type: "string", description: "Optional path to filter commits to that file" },
      per_page: { type: "integer", description: "Max commits (default 10, max 30)" },
    },
    required: ["owner", "repo"],
  },
};

const GITHUB_LIST_ISSUES: Anthropic.Tool = {
  name: "github_list_issues",
  description: "List issues in a repo (excludes PRs). Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      state: { type: "string", enum: ["open", "closed", "all"], description: "Default 'open'" },
      per_page: { type: "integer", description: "Max issues (default 15, max 30)" },
    },
    required: ["owner", "repo"],
  },
};

const GITHUB_GET_ISSUE: Anthropic.Tool = {
  name: "github_get_issue",
  description: "Fetch a single issue with its full body and comments. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      number: { type: "integer", description: "Issue number" },
    },
    required: ["owner", "repo", "number"],
  },
};

const GITHUB_LIST_PULLS: Anthropic.Tool = {
  name: "github_list_pulls",
  description: "List pull requests in a repo. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      state: { type: "string", enum: ["open", "closed", "all"], description: "Default 'open'" },
      per_page: { type: "integer", description: "Max PRs (default 15, max 30)" },
    },
    required: ["owner", "repo"],
  },
};

const GITHUB_GET_PULL: Anthropic.Tool = {
  name: "github_get_pull",
  description: "Fetch a single pull request with its body, base/head refs, merge status, commit/diff stats, and a list of files changed. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      number: { type: "integer", description: "Pull request number" },
    },
    required: ["owner", "repo", "number"],
  },
};

// ─── Marcus — legal-specialised tools ───────────────────────────────────────

const ANALYZE_DOCUMENT: Anthropic.Tool = {
  name: "analyze_document",
  description:
    "Parse a PDF or DOCX the user attached to this conversation and return the full extracted text plus a structural summary (section markers, party indicators, dates). Use this BEFORE review_contract or any commentary on a document. Input is a document_id surfaced by the chat attachment block — never ask the user to paste the file contents themselves.",
  input_schema: {
    type: "object" as const,
    properties: {
      document_id: {
        type: "string",
        description:
          "UUID of the marcus_documents row, surfaced in the [Attached document …] block of the user message.",
      },
    },
    required: ["document_id"],
  },
};

const REVIEW_CONTRACT: Anthropic.Tool = {
  name: "review_contract",
  description:
    "Run a structured legal-risk pass over a previously-parsed document. Returns the document text plus a category checklist YOU must fill out: document type, parties, effective date / term, renewal & termination, financial obligations, payment terms, scope, IP, confidentiality, data handling, warranties, indemnification, limitation of liability, insurance, governing law, dispute resolution, assignment & change of control, force majeure, notices, severability. Each category requires (1) inline verbatim quote, (2) plain-language risk, (3) HIGH/MEDIUM/LOW tag, (4) proposed redline. Close with a TOP RISKS section and the not-legal-advice disclaimer.",
  input_schema: {
    type: "object" as const,
    properties: {
      document_id: {
        type: "string",
        description: "UUID of the marcus_documents row to review.",
      },
    },
    required: ["document_id"],
  },
};

const DRAFT_LEGAL_DOCUMENT: Anthropic.Tool = {
  name: "draft_legal_document",
  description:
    "Generate a downloadable legal document (default docx). Provides a per-document-type scaffold and returns a 24h signed link. Always verify jurisdiction, parties, and headline economics first — ask 2–3 clarifying questions if any are missing. The not-legal-advice disclaimer is injected automatically. Supported document_types: nda_mutual, nda_one_way, terms_of_service, marketplace_terms_of_service, privacy_policy, msa, founder_agreement, contractor_agreement, employment_offer_letter.",
  input_schema: {
    type: "object" as const,
    properties: {
      document_type: {
        type: "string",
        enum: [
          "nda_mutual",
          "nda_one_way",
          "terms_of_service",
          "marketplace_terms_of_service",
          "privacy_policy",
          "msa",
          "founder_agreement",
          "contractor_agreement",
          "employment_offer_letter",
        ],
      },
      parties: {
        type: "array",
        description:
          "Each party with full legal name (required) and optional role + address.",
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" },
            role: {
              type: "string",
              description: "e.g. 'Operator', 'Seller', 'Disclosing Party'",
            },
            address: { type: "string" },
          },
          required: ["name"],
        },
      },
      jurisdiction: {
        type: "string",
        description:
          "Governing law jurisdiction, e.g. 'Delaware, USA' or 'England & Wales'.",
      },
      key_terms: {
        type: "object" as const,
        description:
          "Free-form bag of deal-specific terms — fees, term length, scope, exclusivity, termination rights, etc. Marcus uses these to fill the scaffold.",
      },
      format: {
        type: "string",
        enum: ["docx", "pdf"],
        description: "Default docx.",
      },
      title: {
        type: "string",
        description: "Optional override for the document title and filename.",
      },
    },
    required: ["document_type", "parties", "jurisdiction", "key_terms"],
  },
};

const FLAG_LEGAL_RISKS: Anthropic.Tool = {
  name: "flag_legal_risks",
  description:
    "Free-form legal-risk analysis for a described business activity or a single contract clause. Returns a markdown checklist Marcus fills in covering contract & commercial, IP, employment, privacy (GDPR/CCPA), consumer protection, securities & fundraising, tax, regulatory, anti-trust, marketing claims, and dispute exposure. Use when the user describes a new offering, market, clause, or hypothetical and wants a triaged risk picture before drafting. Markdown output only — no file.",
  input_schema: {
    type: "object" as const,
    properties: {
      activity_description: {
        type: "string",
        description:
          "Plain-language description of the activity or clause to analyze. Be specific: include geography, parties, money flow, and data flow if relevant.",
      },
    },
    required: ["activity_description"],
  },
};

const USE_DESKTOP: Anthropic.Tool = {
  name: "use_desktop",
  description:
    "Spin up an isolated Linux desktop with a real browser to complete tasks that require visiting a website, clicking, scrolling, filling forms, or reading rendered pages that web_search can't see (interactive widgets, paywalls, JS-only content, multi-step flows). The user watches the desktop live in their chat. Use sparingly — sessions cost money and take ~30s to start. Do NOT use for tasks doable via web_search. Never visit pages requiring login, banking sites, or anything with credentials. The session terminates automatically when the task is complete.",
  input_schema: {
    type: "object" as const,
    properties: {
      task: {
        type: "string",
        description:
          "Plain-language description of what should happen on the desktop. Be specific about the goal AND the success criteria. Example: 'Open weather.gov, search for San Francisco, and report tomorrow's high temperature.'",
      },
    },
    required: ["task"],
  },
};

// ─── Gmail tools ─────────────────────────────────────────────────────────────

const GMAIL_SEARCH_THREADS: Anthropic.Tool = {
  name: "gmail_search_threads",
  description:
    "Search the user's Gmail using Gmail query syntax (e.g. `from:stripe newer_than:7d`). Returns recent matching threads with id, subject, from, and snippet. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Gmail search query" },
      max_results: { type: "integer", description: "Max threads to return (default 10, max 50)" },
    },
    required: ["query"],
  },
};

const GMAIL_GET_THREAD: Anthropic.Tool = {
  name: "gmail_get_thread",
  description:
    "Fetch the full text/plain content of every message in a Gmail thread. Use after gmail_search_threads when you need the actual email body. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      thread_id: { type: "string", description: "Gmail thread id" },
    },
    required: ["thread_id"],
  },
};

const GMAIL_CREATE_DRAFT: Anthropic.Tool = {
  name: "gmail_create_draft",
  description:
    "Create a Gmail draft. The user reviews and sends it themselves — never sends directly. Use this for any email composed in the user's Gmail. Optionally attach to an existing thread to make the draft a reply.",
  input_schema: {
    type: "object" as const,
    properties: {
      to: { type: "string", description: "Recipient email address" },
      subject: { type: "string" },
      body: { type: "string", description: "Plain-text body" },
      thread_id: { type: "string", description: "Optional Gmail thread id to reply within" },
      force_send: { type: "boolean", description: "Dana-only: override the do_not_contact CRM block. Set true only when the user explicitly says to draft for a DNC contact anyway." },
    },
    required: ["to", "subject", "body"],
  },
};

const GMAIL_LIST_DRAFTS: Anthropic.Tool = {
  name: "gmail_list_drafts",
  description: "List the user's existing Gmail drafts (id, subject, snippet). Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      max_results: { type: "integer", description: "Max drafts to return (default 20, max 50)" },
    },
  },
};

const GMAIL_LIST_LABELS: Anthropic.Tool = {
  name: "gmail_list_labels",
  description: "List all Gmail labels the user has (system + user labels). Use to find label ids before applying them.",
  input_schema: { type: "object" as const, properties: {} },
};

const GMAIL_CREATE_LABEL: Anthropic.Tool = {
  name: "gmail_create_label",
  description: "Create a new Gmail label. Returns the new label's id and name.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Display name for the label" },
    },
    required: ["name"],
  },
};

const GMAIL_LABEL_MESSAGE: Anthropic.Tool = {
  name: "gmail_label_message",
  description:
    "Apply (and optionally remove) labels on a single Gmail message. Confirm with the user first if removing labels like INBOX or applying TRASH.",
  input_schema: {
    type: "object" as const,
    properties: {
      message_id: { type: "string" },
      add_label_ids: { type: "array", items: { type: "string" } },
      remove_label_ids: { type: "array", items: { type: "string" } },
    },
    required: ["message_id", "add_label_ids"],
  },
};

const GMAIL_UNLABEL_MESSAGE: Anthropic.Tool = {
  name: "gmail_unlabel_message",
  description: "Remove labels from a single Gmail message.",
  input_schema: {
    type: "object" as const,
    properties: {
      message_id: { type: "string" },
      label_ids: { type: "array", items: { type: "string" } },
    },
    required: ["message_id", "label_ids"],
  },
};

const GMAIL_LABEL_THREAD: Anthropic.Tool = {
  name: "gmail_label_thread",
  description:
    "Apply (and optionally remove) labels on every message in a Gmail thread. Confirm with the user first if applying TRASH or removing INBOX.",
  input_schema: {
    type: "object" as const,
    properties: {
      thread_id: { type: "string" },
      add_label_ids: { type: "array", items: { type: "string" } },
      remove_label_ids: { type: "array", items: { type: "string" } },
    },
    required: ["thread_id", "add_label_ids"],
  },
};

const GMAIL_UNLABEL_THREAD: Anthropic.Tool = {
  name: "gmail_unlabel_thread",
  description: "Remove labels from every message in a Gmail thread.",
  input_schema: {
    type: "object" as const,
    properties: {
      thread_id: { type: "string" },
      label_ids: { type: "array", items: { type: "string" } },
    },
    required: ["thread_id", "label_ids"],
  },
};

const GMAIL_TOOLS = [
  GMAIL_SEARCH_THREADS,
  GMAIL_GET_THREAD,
  GMAIL_CREATE_DRAFT,
  GMAIL_LIST_DRAFTS,
  GMAIL_LIST_LABELS,
  GMAIL_CREATE_LABEL,
  GMAIL_LABEL_MESSAGE,
  GMAIL_UNLABEL_MESSAGE,
  GMAIL_LABEL_THREAD,
  GMAIL_UNLABEL_THREAD,
];

// ─── Calendar tools ──────────────────────────────────────────────────────────

const CALENDAR_LIST_CALENDARS: Anthropic.Tool = {
  name: "calendar_list_calendars",
  description: "List all calendars the user has access to. Use to find non-primary calendar ids.",
  input_schema: { type: "object" as const, properties: {} },
};

const CALENDAR_LIST_EVENTS: Anthropic.Tool = {
  name: "calendar_list_events",
  description:
    "List events from a calendar within a time range. Defaults to the primary calendar. timeMin/timeMax are RFC3339 timestamps.",
  input_schema: {
    type: "object" as const,
    properties: {
      calendar_id: { type: "string", description: "Calendar id (default 'primary')" },
      time_min: { type: "string", description: "RFC3339 lower bound, e.g. 2026-05-02T00:00:00Z" },
      time_max: { type: "string", description: "RFC3339 upper bound" },
      q: { type: "string", description: "Free-text search across event fields" },
      max_results: { type: "integer", description: "Default 25, max 100" },
    },
  },
};

const CALENDAR_GET_EVENT: Anthropic.Tool = {
  name: "calendar_get_event",
  description: "Fetch a single calendar event in full.",
  input_schema: {
    type: "object" as const,
    properties: {
      calendar_id: { type: "string" },
      event_id: { type: "string" },
    },
    required: ["calendar_id", "event_id"],
  },
};

const CALENDAR_CREATE_EVENT: Anthropic.Tool = {
  name: "calendar_create_event",
  description:
    "Create a calendar event. start/end are objects: either { dateTime, timeZone } for timed events or { date } for all-day. Attendees auto-receive invites.",
  input_schema: {
    type: "object" as const,
    properties: {
      calendar_id: { type: "string", description: "Calendar id (default 'primary')" },
      summary: { type: "string", description: "Event title" },
      description: { type: "string" },
      location: { type: "string" },
      start: {
        type: "object" as const,
        description: "{ dateTime: ISO, timeZone: 'America/New_York' } OR { date: 'YYYY-MM-DD' }",
      },
      end: {
        type: "object" as const,
        description: "Same shape as start",
      },
      attendees: {
        type: "array",
        items: { type: "object" as const, properties: { email: { type: "string" } }, required: ["email"] },
      },
    },
    required: ["summary", "start", "end"],
  },
};

const CALENDAR_UPDATE_EVENT: Anthropic.Tool = {
  name: "calendar_update_event",
  description: "Patch fields on an existing calendar event. Only the fields you provide are updated.",
  input_schema: {
    type: "object" as const,
    properties: {
      calendar_id: { type: "string" },
      event_id: { type: "string" },
      patch: { type: "object" as const, description: "Partial event fields to update (summary, start, end, attendees, etc.)" },
    },
    required: ["calendar_id", "event_id", "patch"],
  },
};

const CALENDAR_DELETE_EVENT: Anthropic.Tool = {
  name: "calendar_delete_event",
  description: "Delete a calendar event. Confirm with the user first — this is irreversible and notifies attendees.",
  input_schema: {
    type: "object" as const,
    properties: {
      calendar_id: { type: "string" },
      event_id: { type: "string" },
    },
    required: ["calendar_id", "event_id"],
  },
};

const CALENDAR_RESPOND_TO_EVENT: Anthropic.Tool = {
  name: "calendar_respond_to_event",
  description: "RSVP to a calendar event you're invited to. Updates the user's attendee responseStatus.",
  input_schema: {
    type: "object" as const,
    properties: {
      calendar_id: { type: "string" },
      event_id: { type: "string" },
      response: { type: "string", enum: ["accepted", "declined", "tentative"] },
    },
    required: ["calendar_id", "event_id", "response"],
  },
};

const CALENDAR_SUGGEST_TIME: Anthropic.Tool = {
  name: "calendar_suggest_time",
  description:
    "Find up to 5 free meeting slots that work for everyone in `attendees` within the next `within_days` days, during business hours (9–17). Returns ISO start/end pairs.",
  input_schema: {
    type: "object" as const,
    properties: {
      duration_minutes: { type: "integer" },
      attendees: { type: "array", items: { type: "string" }, description: "Email addresses" },
      within_days: { type: "integer", description: "Search window (default 7, max 30)" },
    },
    required: ["duration_minutes", "attendees"],
  },
};

const CALENDAR_TOOLS = [
  CALENDAR_LIST_CALENDARS,
  CALENDAR_LIST_EVENTS,
  CALENDAR_GET_EVENT,
  CALENDAR_CREATE_EVENT,
  CALENDAR_UPDATE_EVENT,
  CALENDAR_DELETE_EVENT,
  CALENDAR_RESPOND_TO_EVENT,
  CALENDAR_SUGGEST_TIME,
];

// ─── Stripe + Sheets + P&L tools (Jeremy) ────────────────────────────────────

const GET_STRIPE_FINANCIAL_SUMMARY: Anthropic.Tool = {
  name: "get_stripe_financial_summary",
  description:
    "Pull a multi-metric financial summary live from the user's connected Stripe account: MRR, ARR, active subscriptions, trialing subs, customer counts, gross/net revenue and refunds in the window, failed payments, and top plans by MRR. Default first call when the user asks 'how is the business doing'. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      period_days: {
        type: "integer",
        description: "Lookback window for revenue/refund/failed-payment counts (default 30, max 365).",
        minimum: 1,
        maximum: 365,
      },
    },
  },
};

const GET_STRIPE_METRIC: Anthropic.Tool = {
  name: "get_stripe_metric",
  description:
    "Pull a single named financial metric live from Stripe. Use for narrow follow-ups; for broad reports prefer get_stripe_financial_summary. Read-only.",
  input_schema: {
    type: "object" as const,
    properties: {
      metric: {
        type: "string",
        enum: [
          "mrr",
          "arr",
          "active_customers",
          "new_customers",
          "active_subscriptions",
          "trials",
          "gross_revenue",
          "net_revenue",
          "failed_payments",
          "average_revenue_per_customer",
        ],
        description: "Which metric to retrieve.",
      },
      period_days: {
        type: "integer",
        description: "Lookback window in days (default 30, max 365). Ignored for point-in-time metrics like MRR.",
        minimum: 1,
        maximum: 365,
      },
    },
    required: ["metric"],
  },
};

const READ_GOOGLE_SHEET: Anthropic.Tool = {
  name: "read_google_sheet",
  description:
    "Read values from a Google Sheet the user has shared (paste the URL or just the spreadsheet id). Returns rows as tab-separated text. Use to import historical data into your analysis.",
  input_schema: {
    type: "object" as const,
    properties: {
      spreadsheet_id_or_url: {
        type: "string",
        description: "Spreadsheet URL or bare id.",
      },
      range: {
        type: "string",
        description:
          "A1-notation range, e.g. 'Sheet1!A1:F50' or 'A1:Z100' (defaults to A1:Z100). Always quote tab names with spaces.",
      },
    },
    required: ["spreadsheet_id_or_url"],
  },
};

const WRITE_GOOGLE_SHEET: Anthropic.Tool = {
  name: "write_google_sheet",
  description:
    "Create a new Google Sheet, append rows to an existing tab, or update a specific range. Use for forecasts, budgets, models the user wants to keep editing in Google. Returns the spreadsheet URL.",
  input_schema: {
    type: "object" as const,
    properties: {
      mode: {
        type: "string",
        enum: ["create", "append", "update"],
        description:
          "create = new spreadsheet (provide title + rows). append = add rows to an existing sheet (provide spreadsheet_id_or_url + sheet_name + rows). update = overwrite a specific range (provide spreadsheet_id_or_url + range + rows).",
      },
      title: {
        type: "string",
        description: "Title for the new spreadsheet (mode=create only).",
      },
      spreadsheet_id_or_url: {
        type: "string",
        description: "Spreadsheet URL or bare id (mode=append or update).",
      },
      sheet_name: {
        type: "string",
        description: "Tab name to append to (mode=append).",
      },
      range: {
        type: "string",
        description: "A1-notation range to overwrite, e.g. 'Sheet1!A2:D50' (mode=update).",
      },
      headers: {
        type: "array",
        items: { type: "string" },
        description: "Optional header row prepended to rows (mode=create or append).",
      },
      rows: {
        type: "array",
        items: { type: "array", items: { type: "string" } },
        description: "Data rows (each row is an array of cell strings).",
      },
    },
    required: ["mode", "rows"],
  },
};

const BUILD_PNL_SNAPSHOT: Anthropic.Tool = {
  name: "build_pnl_snapshot",
  description:
    "Compose a P&L snapshot from live Stripe revenue + user-supplied costs. By default produces both a Google Sheet (live, editable) and an XLSX download. Ask the user once for cost categories before calling unless they have already provided them.",
  input_schema: {
    type: "object" as const,
    properties: {
      period_days: {
        type: "integer",
        description: "Lookback window for revenue (default 30, max 365).",
        minimum: 1,
        maximum: 365,
      },
      costs: {
        type: "object" as const,
        description:
          "Cost categories as { category: amount-in-major-currency-units }, e.g. { Payroll: 30000, COGS: 5000, Tools: 800 }. Omit if the user truly has no costs.",
        additionalProperties: { type: "number" },
      },
      title: {
        type: "string",
        description: "Optional title (defaults to 'P&L — Last Nd (YYYY-MM-DD)').",
      },
      deliver: {
        type: "string",
        enum: ["sheet", "xlsx", "both"],
        description: "Output format (default 'both').",
      },
    },
  },
};

const JEREMY_FINANCIAL_TOOLS = [
  GET_STRIPE_FINANCIAL_SUMMARY,
  GET_STRIPE_METRIC,
  READ_GOOGLE_SHEET,
  WRITE_GOOGLE_SHEET,
  BUILD_PNL_SNAPSHOT,
];

// ─── CRM tools (Dana) ────────────────────────────────────────────────────────

const CRM_ADD_CONTACT: Anthropic.Tool = {
  name: "crm_add_contact",
  description:
    "Create or update a CRM contact. Idempotent on email — if a contact with the same email exists, it updates only the fields you supply. Use whenever you learn about a new prospect or get fresh info on an existing one. Returns the contact id you'll use for deals and activities.",
  input_schema: {
    type: "object" as const,
    properties: {
      full_name: { type: "string", description: "Full name (required)" },
      email: { type: "string", description: "Email address (used for upsert; case-insensitive)" },
      phone: { type: "string" },
      title: { type: "string", description: "Job title, e.g. 'VP Sales'" },
      company: { type: "string" },
      linkedin_url: { type: "string", description: "Public LinkedIn profile URL" },
      notes: { type: "string", description: "Freeform notes — research findings, mutual connections, etc." },
      source: { type: "string", description: "Where the lead came from (e.g. 'inbound', 'referral: Jane', 'event: SaaStr')" },
      status: {
        type: "string",
        enum: ["active", "cold", "do_not_contact", "customer"],
        description: "Defaults to 'active'. Set 'do_not_contact' to block future emails to this person.",
      },
      tags: { type: "array", items: { type: "string" }, description: "Freeform tags for segmentation" },
    },
    required: ["full_name"],
  },
};

const CRM_GET_CONTACT: Anthropic.Tool = {
  name: "crm_get_contact",
  description:
    "Fetch a single contact by id, email, or name. Returns the contact plus their open deals and the last 10 activities. Use whenever a person comes up in conversation — your first move before drafting any outreach.",
  input_schema: {
    type: "object" as const,
    properties: {
      id_or_email: { type: "string", description: "Contact id (UUID), email address, or full name" },
    },
    required: ["id_or_email"],
  },
};

const CRM_LIST_CONTACTS: Anthropic.Tool = {
  name: "crm_list_contacts",
  description:
    "List/filter contacts. Use to find someone by company when you don't have their email, or to pull a segment for a campaign.",
  input_schema: {
    type: "object" as const,
    properties: {
      company: { type: "string", description: "Match contacts whose company contains this substring (case-insensitive)" },
      status: {
        type: "string",
        enum: ["active", "cold", "do_not_contact", "customer"],
      },
      tag: { type: "string", description: "Match contacts who have this tag" },
      recently_contacted_days: { type: "integer", description: "Only contacts touched in the last N days" },
      query: { type: "string", description: "Free-text match across name, company, or email" },
      limit: { type: "integer", description: "Default 25, max 100" },
      offset: { type: "integer", description: "For pagination (default 0)" },
    },
  },
};

const CRM_CREATE_DEAL: Anthropic.Tool = {
  name: "crm_create_deal",
  description:
    "Create a deal. Link to a primary contact and optionally add additional stakeholders with their roles (champion, decision_maker, procurement, technical, user). Stages: new, qualified, meeting, proposal, negotiation, won, lost.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Deal title, e.g. 'Acme — annual seats'" },
      primary_contact_id: { type: "string", description: "UUID of the primary contact (your champion or main point of contact)" },
      additional_contacts: {
        type: "array",
        description: "Other stakeholders on the deal",
        items: {
          type: "object" as const,
          properties: {
            contact_id: { type: "string", description: "UUID of the contact" },
            role: {
              type: "string",
              enum: ["champion", "decision_maker", "procurement", "technical", "user", "other"],
            },
          },
          required: ["contact_id"],
        },
      },
      company: { type: "string" },
      value: { type: "number", description: "Deal value in major currency units (e.g. 50000 for $50k)" },
      currency: { type: "string", description: "ISO currency code (default 'usd')" },
      stage: {
        type: "string",
        enum: ["new", "qualified", "meeting", "proposal", "negotiation", "won", "lost"],
      },
      probability: { type: "integer", description: "0-100 close probability (default 10)" },
      expected_close_date: { type: "string", description: "YYYY-MM-DD" },
      notes: { type: "string" },
    },
    required: ["title"],
  },
};

const CRM_UPDATE_DEAL: Anthropic.Tool = {
  name: "crm_update_deal",
  description:
    "Patch a deal. Only fields you supply are updated. Stage transitions to won/lost auto-stamp closed_at.",
  input_schema: {
    type: "object" as const,
    properties: {
      deal_id: { type: "string", description: "Deal UUID" },
      title: { type: "string" },
      primary_contact_id: { type: "string" },
      company: { type: "string" },
      value: { type: "number", description: "Deal value in major currency units" },
      currency: { type: "string" },
      stage: {
        type: "string",
        enum: ["new", "qualified", "meeting", "proposal", "negotiation", "won", "lost"],
      },
      probability: { type: "integer", description: "0-100" },
      expected_close_date: { type: "string", description: "YYYY-MM-DD" },
      notes: { type: "string" },
    },
    required: ["deal_id"],
  },
};

const CRM_GET_DEAL: Anthropic.Tool = {
  name: "crm_get_deal",
  description:
    "Fetch a single deal with primary contact, all stakeholders, and the last 20 activities. Use when the user asks about a specific deal by name or id.",
  input_schema: {
    type: "object" as const,
    properties: {
      deal_id: { type: "string", description: "Deal UUID" },
    },
    required: ["deal_id"],
  },
};

const CRM_LIST_DEALS: Anthropic.Tool = {
  name: "crm_list_deals",
  description:
    "List/filter deals. Defaults show all deals across all stages. Use open_only=true to exclude won/lost.",
  input_schema: {
    type: "object" as const,
    properties: {
      stage: {
        type: "string",
        enum: ["new", "qualified", "meeting", "proposal", "negotiation", "won", "lost"],
      },
      company: { type: "string", description: "Match deals whose company contains this substring" },
      contact_id: { type: "string", description: "Only deals where this contact is primary" },
      open_only: { type: "boolean", description: "Exclude won and lost (default false)" },
      limit: { type: "integer", description: "Default 50, max 200" },
      offset: { type: "integer" },
    },
  },
};

const CRM_PIPELINE_SUMMARY: Anthropic.Tool = {
  name: "crm_pipeline_summary",
  description:
    "Aggregate pipeline view: count/total/weighted value per stage, plus the 5 most recent wins and losses. Start here for any 'how's pipeline' or 'forecast' question — drill into crm_list_deals only if the user wants specifics.",
  input_schema: {
    type: "object" as const,
    properties: {
      currency: { type: "string", description: "Currency code for display (default 'usd')" },
    },
  },
};

const CRM_LOG_ACTIVITY: Anthropic.Tool = {
  name: "crm_log_activity",
  description:
    "Log a sales activity (call, meeting, note, task, linkedin touch) against a contact and/or deal. Do NOT use this for emails you draft via gmail_create_draft, draft_email, or send_email — those are auto-logged.",
  input_schema: {
    type: "object" as const,
    properties: {
      contact_id: { type: "string", description: "UUID of the contact this activity relates to" },
      deal_id: { type: "string", description: "UUID of the deal this activity relates to" },
      activity_type: {
        type: "string",
        enum: ["call", "meeting", "note", "task", "linkedin"],
        description: "Type of activity. Do not use 'email' here — emails are auto-logged.",
      },
      subject: { type: "string", description: "Short subject line, e.g. '30-min discovery call'" },
      body: { type: "string", description: "Notes from the call/meeting, summary of the touch" },
      occurred_at: { type: "string", description: "ISO timestamp; defaults to now" },
    },
    required: ["activity_type"],
  },
};

const CRM_TOOLS = [
  CRM_ADD_CONTACT,
  CRM_GET_CONTACT,
  CRM_LIST_CONTACTS,
  CRM_CREATE_DEAL,
  CRM_UPDATE_DEAL,
  CRM_GET_DEAL,
  CRM_LIST_DEALS,
  CRM_PIPELINE_SUMMARY,
  CRM_LOG_ACTIVITY,
];

// ─── LinkedIn tools (Dana) ───────────────────────────────────────────────────

const LINKEDIN_LOOKUP_PROFILE: Anthropic.Tool = {
  name: "linkedin_lookup_profile",
  description:
    "Fetch a public LinkedIn profile by URL or by name+company. Returns headline, current role, summary, work history, and education. Cached 30 days. No OAuth, public data only. Use for any new prospect before drafting outreach so you can reference their background.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: { type: "string", description: "Public LinkedIn profile URL (e.g. https://www.linkedin.com/in/janedoe). Preferred when known." },
      name: { type: "string", description: "Full name. Use when URL is unknown." },
      company: { type: "string", description: "Company name to disambiguate when searching by name." },
    },
  },
};

const LINKEDIN_TOOLS = [LINKEDIN_LOOKUP_PROFILE];

// ─── Per-agent tool sets ─────────────────────────────────────────────────────

const ALL_TOOLS = [CREATE_FILE, WEB_SEARCH, SEND_EMAIL, DRAFT_EMAIL, APPEND_TO_KB, GET_AGENT_OUTPUT];

const MAYA_TOOLS = [CREATE_FILE, WEB_SEARCH, APPEND_TO_KB, GET_AGENT_OUTPUT, UPDATE_BRAND_PROFILE];

const ALEX_TOOLS = [...ALL_TOOLS, ...GMAIL_TOOLS, ...CALENDAR_TOOLS, USE_DESKTOP];
const DANA_TOOLS = [...ALL_TOOLS, ...GMAIL_TOOLS, ...CRM_TOOLS, ...LINKEDIN_TOOLS];
const JEREMY_TOOLS = [...ALL_TOOLS, ...JEREMY_FINANCIAL_TOOLS];

const GITHUB_TOOLS = [
  GITHUB_SEARCH_REPOS,
  GITHUB_GET_REPO,
  GITHUB_READ_FILE,
  GITHUB_LIST_DIR,
  GITHUB_SEARCH_CODE,
  GITHUB_LIST_COMMITS,
  GITHUB_LIST_ISSUES,
  GITHUB_GET_ISSUE,
  GITHUB_LIST_PULLS,
  GITHUB_GET_PULL,
];

const KAI_TOOLS = [...ALL_TOOLS, EXECUTE_CODE, ...GITHUB_TOOLS];

const MARCUS_LEGAL_TOOLS = [
  ANALYZE_DOCUMENT,
  REVIEW_CONTRACT,
  DRAFT_LEGAL_DOCUMENT,
  FLAG_LEGAL_RISKS,
];
const MARCUS_TOOLS = [...ALL_TOOLS, ...MARCUS_LEGAL_TOOLS];

// AGENT_TOOLS: used in /api/chat — Alex gets Gmail+Calendar; Dana gets Gmail; Kai gets execute_code + GitHub; Jeremy gets Stripe + Sheets + P&L; Marcus gets legal tools
export const AGENT_TOOLS: Partial<Record<AgentKey, Anthropic.Tool[]>> = {
  alex:   ALEX_TOOLS,
  jeremy: JEREMY_TOOLS,
  kai:    KAI_TOOLS,
  dana:   DANA_TOOLS,
  marcus: MARCUS_TOOLS,
  maya:   MAYA_TOOLS,
};

// TASK_AGENT_TOOLS: used in /api/task — same as AGENT_TOOLS for Kai
export const TASK_AGENT_TOOLS: Partial<Record<AgentKey, Anthropic.Tool[]>> = {
  alex:   ALEX_TOOLS,
  jeremy: JEREMY_TOOLS,
  kai:    KAI_TOOLS,
  dana:   DANA_TOOLS,
  marcus: MARCUS_TOOLS,
  maya:   MAYA_TOOLS,
};

// ─── Status labels for the UI ────────────────────────────────────────────────

export const TOOL_LABELS: Record<string, string> = {
  create_file:              "Generating file...",
  web_search:               "Searching the web...",
  send_email:               "Sending email...",
  draft_email:              "Drafting email...",
  append_to_knowledge_base: "Saving to knowledge base...",
  update_brand_profile:     "Updating brand profile...",
  execute_code:             "Running code...",
  github_search_repos:      "Searching GitHub repos...",
  github_get_repo:          "Loading repo metadata...",
  github_read_file:         "Reading file from GitHub...",
  github_list_directory:    "Listing repo files...",
  github_search_code:       "Searching code...",
  github_list_commits:      "Loading commits...",
  github_list_issues:       "Loading issues...",
  github_get_issue:         "Reading issue...",
  github_list_pulls:        "Loading pull requests...",
  github_get_pull:          "Reading pull request...",
  use_desktop:              "Opening desktop session...",
  gmail_search_threads:     "Searching Gmail...",
  gmail_get_thread:         "Reading Gmail thread...",
  gmail_create_draft:       "Creating Gmail draft...",
  gmail_list_drafts:        "Loading drafts...",
  gmail_list_labels:        "Loading labels...",
  gmail_create_label:       "Creating label...",
  gmail_label_message:      "Labeling message...",
  gmail_unlabel_message:    "Unlabeling message...",
  gmail_label_thread:       "Labeling thread...",
  gmail_unlabel_thread:     "Unlabeling thread...",
  calendar_list_calendars:  "Loading calendars...",
  calendar_list_events:     "Reading calendar...",
  calendar_get_event:       "Reading event...",
  calendar_create_event:    "Creating event...",
  calendar_update_event:    "Updating event...",
  calendar_delete_event:    "Deleting event...",
  calendar_respond_to_event: "Responding to invite...",
  calendar_suggest_time:    "Finding free time...",
  get_stripe_financial_summary: "Pulling Stripe metrics...",
  get_stripe_metric:           "Pulling Stripe metric...",
  read_google_sheet:           "Reading sheet...",
  write_google_sheet:          "Writing sheet...",
  build_pnl_snapshot:          "Building P&L snapshot...",
  crm_add_contact:             "Saving contact...",
  crm_get_contact:             "Looking up contact...",
  crm_list_contacts:           "Searching contacts...",
  crm_create_deal:             "Creating deal...",
  crm_update_deal:             "Updating deal...",
  crm_get_deal:                "Loading deal...",
  crm_list_deals:              "Loading deals...",
  crm_pipeline_summary:        "Summarizing pipeline...",
  crm_log_activity:            "Logging activity...",
  linkedin_lookup_profile:     "Looking up LinkedIn profile...",
  analyze_document:            "Parsing document...",
  review_contract:             "Reviewing contract...",
  draft_legal_document:        "Drafting legal document...",
  flag_legal_risks:            "Analyzing legal risks...",
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

export async function executeAgentTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const activityCtx: ActivityContext = {
    supabase: context.supabase,
    userId: context.userId,
    agent: context.agent ?? "alex",
    conversationId: context.conversationId,
    jobId: context.jobId,
  };
  const startedAt = Date.now();
  try {
    const result = await runAgentTool(name, input, context);
    void logActivity({
      ctx: activityCtx,
      toolName: name,
      status: "succeeded",
      input,
      output: result,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorTag =
      err instanceof GoogleNotConnectedError
        ? "google_not_connected"
        : err instanceof StripeNotConnectedError
        ? "stripe_not_connected"
        : message;
    void logActivity({
      ctx: activityCtx,
      toolName: name,
      status: "failed",
      input,
      error: errorTag,
      durationMs: Date.now() - startedAt,
    });
    if (err instanceof GoogleNotConnectedError) {
      return "TOOL_ERROR: google_not_connected. The user has not connected their Google account. Tell them: 'You need to connect your Google account in Settings → Integrations before I can use Gmail, Calendar, or Sheets.' STOP. Do not retry.";
    }
    if (err instanceof StripeNotConnectedError) {
      return "TOOL_ERROR: stripe_not_connected. The user has not connected their Stripe account. Tell them: 'Connect your Stripe account in Settings → Integrations and I'll pull the numbers.' STOP. Do not retry.";
    }
    return `Tool error (${name}): ${message}`;
  }
}

async function runAgentTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  switch (name) {
      case "create_file": {
        // File generation is gated to paid plans
        const fileTier = await getUserTier(context.supabase, context.userId);
        if (fileTier === "free") {
          return "TOOL_ERROR: File generation requires a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry. Tell the user they need to upgrade to generate files.";
        }

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
            void (async () => {
              try {
                const { error } = await context.supabase
                  .from("agent_file_contents")
                  .insert({ user_id: context.userId, title, format, text_content: textContent });
                if (error) console.error("[create_file] content save failed", { title, error: error.message });
              } catch (err) {
                console.error("[create_file] content save threw", { title, error: String(err) });
              }
            })();
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
        const to = (input.to as string) || "";
        if (!to.trim()) throw new Error("Email recipient address is missing");
        const subject = input.subject as string;
        const body = input.body as string;
        if (context.agent === "dana" && !input.force_send) {
          const dncCheck = await crm.findContactByEmail(context.supabase, context.userId, to);
          if (dncCheck && dncCheck.status === "do_not_contact") {
            return `TOOL_ERROR: do_not_contact_blocked. ${dncCheck.full_name} (${dncCheck.email}) is marked do_not_contact in your CRM. To override, retry with force_send: true. To proceed sustainably, first update the contact's status with crm_add_contact (status: 'active'). STOP.`;
          }
        }
        await sendEmail({ to, subject, body });
        if (context.agent === "dana") {
          void crm.autoLogEmailActivity(
            context.supabase,
            context.userId,
            "send_email",
            { to, subject, body },
            {}
          );
        }
        return `Email sent to ${to} — subject: "${subject}"`;
      }

      case "draft_email": {
        const to = (input.to as string) || "";
        if (!to.trim()) throw new Error("Email recipient address is missing");
        const subject = input.subject as string;
        const body = input.body as string;
        if (context.agent === "dana" && !input.force_send) {
          const dncCheck = await crm.findContactByEmail(context.supabase, context.userId, to);
          if (dncCheck && dncCheck.status === "do_not_contact") {
            return `TOOL_ERROR: do_not_contact_blocked. ${dncCheck.full_name} (${dncCheck.email}) is marked do_not_contact in your CRM. To override, retry with force_send: true. To proceed sustainably, first update the contact's status with crm_add_contact (status: 'active'). STOP.`;
          }
        }
        await draftEmail({ to, subject, body });
        if (context.agent === "dana") {
          void crm.autoLogEmailActivity(
            context.supabase,
            context.userId,
            "draft_email",
            { to, subject, body },
            {}
          );
        }
        return `Email sent to ${to} — subject: "${subject}".`;
      }

      case "append_to_knowledge_base": {
        await appendToKnowledgeBase(context.supabase, context.userId, input.section_title as string, input.content as string);
        return `Section "${input.section_title}" saved to the Knowledge Base.`;
      }

      case "update_brand_profile": {
        const patch: Record<string, string> = {};
        for (const k of BRAND_FIELDS) {
          const v = (input as Record<string, unknown>)[k];
          if (typeof v === "string" && v.trim().length > 0) patch[k] = v.trim();
        }
        if (Object.keys(patch).length === 0) {
          return "TOOL_ERROR: provide at least one non-empty field. STOP.";
        }
        await upsertBrandProfile(context.supabase, context.userId, patch);
        return `Brand profile updated: ${Object.keys(patch).join(", ")}.`;
      }

      case "execute_code": {
        const result = await executeCode(
          input.code as string,
          input.language as "python" | "javascript"
        );
        const parts: string[] = [];
        if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
        if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
        if (result.results) parts.push(`return values:\n${result.results}`);
        if (result.error) parts.push(`error:\n${result.error}`);
        if (result.artifacts.length) {
          const summary = result.artifacts.map((a) => `${a.kind} (${a.size} bytes)`).join(", ");
          parts.push(`artifacts produced (not embedded — describe their content textually): ${summary}`);
        }
        parts.push(`(executed in ${result.durationMs}ms)`);
        return parts.length > 1 ? parts.join("\n\n") : "(no output)";
      }

      case "use_desktop": {
        const task = ((input.task as string) ?? "").trim();
        if (!task) return "TOOL_ERROR: task is required. STOP.";
        if (task.length > 2000) return "TOOL_ERROR: task too long (max 2000 chars). STOP.";

        const limit = await checkDesktopSessionLimit(context.supabase, context.userId);
        if (!limit.ok) return limit.reason;

        const run = await runDesktopTool({
          supabase: context.supabase,
          userId: context.userId,
          conversationId: context.conversationId,
          alexJobId: context.jobId,
          task,
        });

        // Surface the computerJobId in the tool result so Alex can reference
        // the session and so a downstream UI step (the inline panel marker the
        // worker writes to alex_jobs.steps) can correlate.
        return `Desktop session ${run.computerJobId} finished. Result:\n${run.result}`;
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

      // ─── Gmail ─────────────────────────────────────────────────────────
      case "gmail_search_threads": {
        const query = (input.query as string)?.trim();
        if (!query) return "TOOL_ERROR: query is required. STOP.";
        const max = Number(input.max_results ?? 10);
        const results = await gmail.searchThreads(context.userId, query, max);
        if (results.length === 0) return "No matching Gmail threads.";
        return results.map((r, i) =>
          `[${i + 1}] thread_id=${r.id} | from: ${r.from} | subject: ${r.subject}\nsnippet: ${r.snippet}`
        ).join("\n\n");
      }

      case "gmail_get_thread": {
        const threadId = (input.thread_id as string)?.trim();
        if (!threadId) return "TOOL_ERROR: thread_id is required. STOP.";
        const thread = await gmail.getThread(context.userId, threadId);
        return thread.messages.map((m, i) =>
          `[Message ${i + 1}] id=${m.id}\nFrom: ${m.from}\nTo: ${m.to}\nDate: ${m.date}\nSubject: ${m.subject}\n\n${m.body}`
        ).join("\n\n---\n\n") || "(empty thread)";
      }

      case "gmail_create_draft": {
        const to = (input.to as string)?.trim();
        const subject = (input.subject as string) ?? "";
        const body = (input.body as string) ?? "";
        if (!to) return "TOOL_ERROR: to is required. STOP.";
        if (context.agent === "dana" && !input.force_send) {
          const dncCheck = await crm.findContactByEmail(context.supabase, context.userId, to);
          if (dncCheck && dncCheck.status === "do_not_contact") {
            return `TOOL_ERROR: do_not_contact_blocked. ${dncCheck.full_name} (${dncCheck.email}) is marked do_not_contact in your CRM. To override, retry with force_send: true. To proceed sustainably, first update the contact's status with crm_add_contact (status: 'active'). STOP.`;
          }
        }
        const draft = await gmail.createDraft(context.userId, {
          to,
          subject,
          body,
          threadId: input.thread_id as string | undefined,
        });
        if (context.agent === "dana") {
          void crm.autoLogEmailActivity(
            context.supabase,
            context.userId,
            "gmail_create_draft",
            { to, subject, body },
            { gmail_message_id: draft.id, gmail_thread_id: draft.threadId }
          );
        }
        return `Gmail draft created. id=${draft.id} threadId=${draft.threadId}. The draft is in the user's Gmail Drafts folder — they review and send.`;
      }

      case "gmail_list_drafts": {
        const max = Number(input.max_results ?? 20);
        const drafts = await gmail.listDrafts(context.userId, max);
        if (drafts.length === 0) return "No drafts.";
        return drafts.map((d, i) =>
          `[${i + 1}] id=${d.id} subject="${d.subject}"\nsnippet: ${d.snippet}`
        ).join("\n\n");
      }

      case "gmail_list_labels": {
        const labels = await gmail.listLabels(context.userId);
        if (labels.length === 0) return "No labels.";
        return labels.map((l) => `${l.id} — ${l.name} (${l.type})`).join("\n");
      }

      case "gmail_create_label": {
        const labelName = (input.name as string)?.trim();
        if (!labelName) return "TOOL_ERROR: name is required. STOP.";
        const created = await gmail.createLabel(context.userId, labelName);
        return `Label created. id=${created.id} name="${created.name}".`;
      }

      case "gmail_label_message": {
        const messageId = (input.message_id as string)?.trim();
        const addLabelIds = (input.add_label_ids as string[]) ?? [];
        const removeLabelIds = (input.remove_label_ids as string[]) ?? [];
        if (!messageId) return "TOOL_ERROR: message_id is required. STOP.";
        if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
          return "TOOL_ERROR: provide at least one label id to add or remove. STOP.";
        }
        await gmail.labelMessage(context.userId, messageId, addLabelIds, removeLabelIds);
        return `Updated labels on message ${messageId} (added: ${addLabelIds.join(",") || "none"}; removed: ${removeLabelIds.join(",") || "none"}).`;
      }

      case "gmail_unlabel_message": {
        const messageId = (input.message_id as string)?.trim();
        const labelIds = (input.label_ids as string[]) ?? [];
        if (!messageId) return "TOOL_ERROR: message_id is required. STOP.";
        if (labelIds.length === 0) return "TOOL_ERROR: label_ids is required. STOP.";
        await gmail.unlabelMessage(context.userId, messageId, labelIds);
        return `Removed labels ${labelIds.join(",")} from message ${messageId}.`;
      }

      case "gmail_label_thread": {
        const threadId = (input.thread_id as string)?.trim();
        const addLabelIds = (input.add_label_ids as string[]) ?? [];
        const removeLabelIds = (input.remove_label_ids as string[]) ?? [];
        if (!threadId) return "TOOL_ERROR: thread_id is required. STOP.";
        if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
          return "TOOL_ERROR: provide at least one label id to add or remove. STOP.";
        }
        await gmail.labelThread(context.userId, threadId, addLabelIds, removeLabelIds);
        return `Updated labels on thread ${threadId} (added: ${addLabelIds.join(",") || "none"}; removed: ${removeLabelIds.join(",") || "none"}).`;
      }

      case "gmail_unlabel_thread": {
        const threadId = (input.thread_id as string)?.trim();
        const labelIds = (input.label_ids as string[]) ?? [];
        if (!threadId) return "TOOL_ERROR: thread_id is required. STOP.";
        if (labelIds.length === 0) return "TOOL_ERROR: label_ids is required. STOP.";
        await gmail.unlabelThread(context.userId, threadId, labelIds);
        return `Removed labels ${labelIds.join(",")} from thread ${threadId}.`;
      }

      // ─── Calendar ──────────────────────────────────────────────────────
      case "calendar_list_calendars": {
        const cals = await calendar.listCalendars(context.userId);
        if (cals.length === 0) return "No calendars.";
        return cals.map((c) =>
          `${c.id}${c.primary ? " (primary)" : ""} — ${c.summary} [${c.timeZone}]`
        ).join("\n");
      }

      case "calendar_list_events": {
        const events = await calendar.listEvents(context.userId, {
          calendarId: input.calendar_id as string | undefined,
          timeMin: input.time_min as string | undefined,
          timeMax: input.time_max as string | undefined,
          q: input.q as string | undefined,
          maxResults: input.max_results ? Number(input.max_results) : undefined,
        });
        if (events.length === 0) return "No events in that range.";
        return events.map((e) => {
          const start = "dateTime" in e.start ? e.start.dateTime : e.start.date;
          const end = "dateTime" in e.end ? e.end.dateTime : e.end.date;
          const attendees = (e.attendees ?? []).map((a) => a.email).join(", ");
          return `id=${e.id} | ${start} → ${end}\n${e.summary ?? "(no title)"}${e.location ? ` @ ${e.location}` : ""}${attendees ? `\nAttendees: ${attendees}` : ""}`;
        }).join("\n\n");
      }

      case "calendar_get_event": {
        const calendarId = (input.calendar_id as string)?.trim();
        const eventId = (input.event_id as string)?.trim();
        if (!calendarId || !eventId) return "TOOL_ERROR: calendar_id and event_id required. STOP.";
        const event = await calendar.getEvent(context.userId, calendarId, eventId);
        return JSON.stringify(event, null, 2);
      }

      case "calendar_create_event": {
        const calendarId = (input.calendar_id as string) || "primary";
        const summary = (input.summary as string)?.trim();
        const start = input.start as { dateTime?: string; date?: string; timeZone?: string } | undefined;
        const end = input.end as { dateTime?: string; date?: string; timeZone?: string } | undefined;
        if (!summary) return "TOOL_ERROR: summary is required. STOP.";
        if (!start || !end) return "TOOL_ERROR: start and end are required. STOP.";
        const created = await calendar.createEvent(context.userId, calendarId, {
          summary,
          description: input.description as string | undefined,
          location: input.location as string | undefined,
          start: start as calendar.EventDateTime,
          end: end as calendar.EventDateTime,
          attendees: input.attendees as calendar.CalendarAttendee[] | undefined,
        });
        return `Event created. id=${created.id} link=${created.htmlLink ?? "(no link)"}`;
      }

      case "calendar_update_event": {
        const calendarId = (input.calendar_id as string)?.trim();
        const eventId = (input.event_id as string)?.trim();
        const patch = input.patch as Record<string, unknown> | undefined;
        if (!calendarId || !eventId) return "TOOL_ERROR: calendar_id and event_id required. STOP.";
        if (!patch || typeof patch !== "object") return "TOOL_ERROR: patch object is required. STOP.";
        const updated = await calendar.updateEvent(context.userId, calendarId, eventId, patch as Partial<calendar.CalendarEvent>);
        return `Event updated. id=${updated.id} link=${updated.htmlLink ?? ""}`;
      }

      case "calendar_delete_event": {
        const calendarId = (input.calendar_id as string)?.trim();
        const eventId = (input.event_id as string)?.trim();
        if (!calendarId || !eventId) return "TOOL_ERROR: calendar_id and event_id required. STOP.";
        await calendar.deleteEvent(context.userId, calendarId, eventId);
        return `Event ${eventId} deleted from ${calendarId}.`;
      }

      case "calendar_respond_to_event": {
        const calendarId = (input.calendar_id as string)?.trim();
        const eventId = (input.event_id as string)?.trim();
        const response = input.response as "accepted" | "declined" | "tentative";
        if (!calendarId || !eventId) return "TOOL_ERROR: calendar_id and event_id required. STOP.";
        if (!["accepted", "declined", "tentative"].includes(response)) {
          return "TOOL_ERROR: response must be accepted, declined, or tentative. STOP.";
        }
        await calendar.respondToEvent(context.userId, calendarId, eventId, response);
        return `Responded ${response} to event ${eventId}.`;
      }

      case "calendar_suggest_time": {
        const duration = Number(input.duration_minutes);
        const attendees = (input.attendees as string[]) ?? [];
        const withinDays = input.within_days ? Number(input.within_days) : undefined;
        if (!duration || duration <= 0) return "TOOL_ERROR: duration_minutes must be positive. STOP.";
        if (attendees.length === 0) return "TOOL_ERROR: attendees array is required. STOP.";
        const slots = await calendar.suggestTime(context.userId, { durationMinutes: duration, attendees, withinDays });
        if (slots.length === 0) return "No free slots found in the requested window.";
        return slots.map((s, i) => `[${i + 1}] ${s.start} → ${s.end}`).join("\n");
      }

      case "get_stripe_financial_summary": {
        const tier = await getUserTier(context.supabase, context.userId);
        if (tier === "free") {
          return "TOOL_ERROR: Stripe analytics require a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry.";
        }
        const periodDays = input.period_days ? Number(input.period_days) : undefined;
        return await getStripeFinancialSummary(context.userId, { periodDays });
      }

      case "get_stripe_metric": {
        const tier = await getUserTier(context.supabase, context.userId);
        if (tier === "free") {
          return "TOOL_ERROR: Stripe analytics require a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry.";
        }
        const metric = input.metric as StripeMetric;
        const allowed: StripeMetric[] = [
          "mrr",
          "arr",
          "active_customers",
          "new_customers",
          "active_subscriptions",
          "trials",
          "gross_revenue",
          "net_revenue",
          "failed_payments",
          "average_revenue_per_customer",
        ];
        if (!metric || !allowed.includes(metric)) {
          return `TOOL_ERROR: Invalid metric "${metric}". Must be one of ${allowed.join(", ")}. STOP.`;
        }
        const periodDays = input.period_days ? Number(input.period_days) : undefined;
        return await getStripeMetric(context.userId, metric, { periodDays });
      }

      case "read_google_sheet": {
        const tier = await getUserTier(context.supabase, context.userId);
        if (tier === "free") {
          return "TOOL_ERROR: Sheet operations require a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry.";
        }
        const idOrUrl = ((input.spreadsheet_id_or_url as string) ?? "").trim();
        const range = ((input.range as string) ?? "").trim() || "A1:Z100";
        if (!idOrUrl) return "TOOL_ERROR: spreadsheet_id_or_url is required. STOP.";
        const text = await readSpreadsheet(context.userId, idOrUrl, range);
        return `Read ${range} from ${idOrUrl}:\n\n${text}`;
      }

      case "write_google_sheet": {
        const tier = await getUserTier(context.supabase, context.userId);
        if (tier === "free") {
          return "TOOL_ERROR: Sheet operations require a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry.";
        }
        const mode = (input.mode as "create" | "append" | "update") ?? "";
        const headers = (input.headers as string[]) ?? [];
        const rows = (input.rows as string[][]) ?? [];
        if (!Array.isArray(rows)) return "TOOL_ERROR: rows must be an array. STOP.";

        const dataRows: (string | number)[][] = headers.length > 0 ? [headers, ...rows] : rows;

        if (mode === "create") {
          const title = ((input.title as string) ?? "").trim();
          if (!title) return "TOOL_ERROR: title is required for mode=create. STOP.";
          const sheet = await createSpreadsheet(context.userId, title, [
            { name: "Sheet1", data: dataRows },
          ]);
          return `Sheet created (${rows.length} data rows). Include this link verbatim in your response so the user can open it:\n[${sheet.title}](${sheet.url})`;
        }

        if (mode === "append") {
          const idOrUrl = ((input.spreadsheet_id_or_url as string) ?? "").trim();
          const sheetName = ((input.sheet_name as string) ?? "").trim() || "Sheet1";
          if (!idOrUrl) return "TOOL_ERROR: spreadsheet_id_or_url is required for mode=append. STOP.";
          if (rows.length === 0 && headers.length === 0) {
            return "TOOL_ERROR: rows (or headers) required for mode=append. STOP.";
          }
          const result = await appendToSpreadsheet(context.userId, idOrUrl, sheetName, dataRows);
          return `Appended ${result.updatedRows} row(s) to ${sheetName} at ${result.updatedRange}.`;
        }

        if (mode === "update") {
          const idOrUrl = ((input.spreadsheet_id_or_url as string) ?? "").trim();
          const range = ((input.range as string) ?? "").trim();
          if (!idOrUrl) return "TOOL_ERROR: spreadsheet_id_or_url is required for mode=update. STOP.";
          if (!range) return "TOOL_ERROR: range is required for mode=update. STOP.";
          if (rows.length === 0) return "TOOL_ERROR: rows are required for mode=update. STOP.";
          const result = await updateSpreadsheetRange(context.userId, idOrUrl, range, dataRows);
          return `Updated ${result.updatedCells} cells at ${result.updatedRange}.`;
        }

        return `TOOL_ERROR: mode must be create, append, or update. Got "${mode}". STOP.`;
      }

      case "build_pnl_snapshot": {
        const tier = await getUserTier(context.supabase, context.userId);
        if (tier === "free") {
          return "TOOL_ERROR: P&L snapshots require a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry.";
        }
        const periodDays = input.period_days ? Number(input.period_days) : undefined;
        const rawCosts = (input.costs ?? {}) as Record<string, unknown>;
        const costs: Record<string, number> = {};
        for (const [k, v] of Object.entries(rawCosts)) {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n) && k.trim()) costs[k.trim()] = n;
        }
        const deliver = (input.deliver as PnlDelivery) ?? "both";
        if (!["sheet", "xlsx", "both"].includes(deliver)) {
          return `TOOL_ERROR: deliver must be sheet, xlsx, or both. STOP.`;
        }
        const titleInput = ((input.title as string) ?? "").trim();
        const result = await buildPnlSnapshot(context.userId, {
          periodDays,
          costs,
          deliver,
          title: titleInput || undefined,
        });
        const finalTitle = titleInput || `P&L — Last ${result.periodDays}d (${result.asOf})`;
        return formatPnlSnapshotResult(finalTitle, result);
      }

      // ─── CRM (Dana) ─────────────────────────────────────────────────────
      case "crm_add_contact": {
        const fullName = ((input.full_name as string) ?? "").trim();
        if (!fullName) return "TOOL_ERROR: full_name is required. STOP.";
        const { contact, created } = await crm.addContact(context.supabase, context.userId, {
          full_name: fullName,
          email: input.email as string | undefined,
          phone: input.phone as string | undefined,
          title: input.title as string | undefined,
          company: input.company as string | undefined,
          linkedin_url: input.linkedin_url as string | undefined,
          notes: input.notes as string | undefined,
          source: input.source as string | undefined,
          status: input.status as crm.ContactStatus | undefined,
          tags: Array.isArray(input.tags) ? (input.tags as string[]) : undefined,
        });
        const verb = created ? "Created" : "Updated";
        return `${verb} contact ${contact.full_name} (id ${contact.id}).\n\n${crm.formatContact(contact)}`;
      }

      case "crm_get_contact": {
        const idOrEmail = ((input.id_or_email as string) ?? "").trim();
        if (!idOrEmail) return "TOOL_ERROR: id_or_email is required. STOP.";
        const result = await crm.getContactByIdOrEmail(context.supabase, context.userId, idOrEmail);
        if (!result) return `No CRM contact found for "${idOrEmail}". Use crm_add_contact to create one.`;
        return crm.formatContact(result.contact, result.deals, result.activities);
      }

      case "crm_list_contacts": {
        const { contacts, total } = await crm.listContacts(context.supabase, context.userId, {
          company: input.company as string | undefined,
          status: input.status as crm.ContactStatus | undefined,
          tag: input.tag as string | undefined,
          recently_contacted_days: input.recently_contacted_days
            ? Number(input.recently_contacted_days)
            : undefined,
          query: input.query as string | undefined,
          limit: input.limit ? Number(input.limit) : undefined,
          offset: input.offset ? Number(input.offset) : undefined,
        });
        return crm.formatContactList(contacts, total);
      }

      case "crm_create_deal": {
        const title = ((input.title as string) ?? "").trim();
        if (!title) return "TOOL_ERROR: title is required. STOP.";
        try {
          const deal = await crm.createDeal(context.supabase, context.userId, {
            title,
            primary_contact_id: input.primary_contact_id as string | undefined,
            additional_contacts: Array.isArray(input.additional_contacts)
              ? (input.additional_contacts as { contact_id: string; role?: crm.DealRole }[])
              : undefined,
            company: input.company as string | undefined,
            value_minor:
              input.value !== undefined ? crm.dollarsToMinor(input.value as number) : undefined,
            currency: input.currency as string | undefined,
            stage: input.stage as crm.DealStage | undefined,
            probability: input.probability ? Number(input.probability) : undefined,
            expected_close_date: input.expected_close_date as string | undefined,
            notes: input.notes as string | undefined,
          });
          return `Deal created (id ${deal.id}).\n\n${crm.formatDeal(deal, null, [], [])}`;
        } catch (err) {
          return `TOOL_ERROR: ${(err as Error).message}. STOP.`;
        }
      }

      case "crm_update_deal": {
        const dealId = ((input.deal_id as string) ?? "").trim();
        if (!dealId) return "TOOL_ERROR: deal_id is required. STOP.";
        try {
          const patch: crm.UpdateDealPatch = {};
          if (input.title !== undefined) patch.title = input.title as string;
          if (input.primary_contact_id !== undefined) {
            patch.primary_contact_id = input.primary_contact_id as string | null;
          }
          if (input.company !== undefined) patch.company = input.company as string | null;
          if (input.value !== undefined) patch.value_minor = crm.dollarsToMinor(input.value as number);
          if (input.currency !== undefined) patch.currency = input.currency as string;
          if (input.stage !== undefined) patch.stage = input.stage as crm.DealStage;
          if (input.probability !== undefined) patch.probability = Number(input.probability);
          if (input.expected_close_date !== undefined) {
            patch.expected_close_date = input.expected_close_date as string | null;
          }
          if (input.notes !== undefined) patch.notes = input.notes as string | null;
          const deal = await crm.updateDeal(context.supabase, context.userId, dealId, patch);
          return `Deal updated.\n\n${crm.formatDeal(deal, null, [], [])}`;
        } catch (err) {
          return `TOOL_ERROR: ${(err as Error).message}. STOP.`;
        }
      }

      case "crm_get_deal": {
        const dealId = ((input.deal_id as string) ?? "").trim();
        if (!dealId) return "TOOL_ERROR: deal_id is required. STOP.";
        const result = await crm.getDeal(context.supabase, context.userId, dealId);
        if (!result) return `No deal found for id ${dealId}.`;
        return crm.formatDeal(result.deal, result.primary_contact, result.stakeholders, result.activities);
      }

      case "crm_list_deals": {
        const { deals, total } = await crm.listDeals(context.supabase, context.userId, {
          stage: input.stage as crm.DealStage | undefined,
          company: input.company as string | undefined,
          contact_id: input.contact_id as string | undefined,
          open_only: input.open_only === true,
          limit: input.limit ? Number(input.limit) : undefined,
          offset: input.offset ? Number(input.offset) : undefined,
        });
        return crm.formatDealList(deals, total);
      }

      case "crm_pipeline_summary": {
        const summary = await crm.pipelineSummary(
          context.supabase,
          context.userId,
          (input.currency as string) || "usd"
        );
        return crm.formatPipelineSummary(summary);
      }

      case "crm_log_activity": {
        const activityType = (input.activity_type as crm.ActivityType) || "note";
        if (activityType === "email") {
          return "TOOL_ERROR: Don't log emails manually — emails drafted via gmail_create_draft, draft_email, or send_email are auto-logged. Use this tool only for call, meeting, note, task, or linkedin. STOP.";
        }
        try {
          const activity = await crm.logCrmActivity(context.supabase, context.userId, {
            contact_id: input.contact_id as string | undefined,
            deal_id: input.deal_id as string | undefined,
            activity_type: activityType,
            subject: input.subject as string | undefined,
            body: input.body as string | undefined,
            occurred_at: input.occurred_at as string | undefined,
          });
          let contactName: string | null = null;
          if (activity.contact_id) {
            const c = await context.supabase
              .from("crm_contacts")
              .select("full_name")
              .eq("id", activity.contact_id)
              .eq("user_id", context.userId)
              .maybeSingle();
            contactName = (c.data as { full_name: string } | null)?.full_name ?? null;
          }
          return crm.formatActivity(activity, contactName);
        } catch (err) {
          return `TOOL_ERROR: ${(err as Error).message}. STOP.`;
        }
      }

      // ─── LinkedIn (Dana) ────────────────────────────────────────────────
      case "linkedin_lookup_profile": {
        const url = (input.url as string)?.trim();
        const name = (input.name as string)?.trim();
        const company = (input.company as string)?.trim();
        if (!url && !name) {
          return "TOOL_ERROR: provide either url or name (with optional company). STOP.";
        }
        const tier = await getUserTier(context.supabase, context.userId);
        const result = await lookupLinkedInProfile(context.supabase, context.userId, {
          url: url || undefined,
          name: name || undefined,
          company: company || undefined,
          tier,
        });
        if (!result.ok) return `TOOL_ERROR: ${result.reason}. STOP.`;
        return formatLinkedInProfile(result.profile, result.cached);
      }

      // ─── GitHub ────────────────────────────────────────────────────────
      case "github_search_repos":
        return github.searchRepos(
          context.userId,
          input.query as string,
          Number(input.per_page ?? 10)
        );

      case "github_get_repo":
        return github.getRepo(
          context.userId,
          input.owner as string,
          input.repo as string
        );

      case "github_read_file":
        return github.readFile(
          context.userId,
          input.owner as string,
          input.repo as string,
          input.path as string,
          input.ref as string | undefined
        );

      case "github_list_directory":
        return github.listDirectory(
          context.userId,
          input.owner as string,
          input.repo as string,
          input.path as string,
          input.ref as string | undefined
        );

      case "github_search_code":
        return github.searchCode(
          context.userId,
          input.query as string,
          Number(input.per_page ?? 10)
        );

      case "github_list_commits":
        return github.listCommits(
          context.userId,
          input.owner as string,
          input.repo as string,
          input.path as string | undefined,
          Number(input.per_page ?? 10)
        );

      case "github_list_issues":
        return github.listIssues(
          context.userId,
          input.owner as string,
          input.repo as string,
          (input.state as "open" | "closed" | "all" | undefined) ?? "open",
          Number(input.per_page ?? 15)
        );

      case "github_get_issue":
        return github.getIssue(
          context.userId,
          input.owner as string,
          input.repo as string,
          Number(input.number)
        );

      case "github_list_pulls":
        return github.listPullRequests(
          context.userId,
          input.owner as string,
          input.repo as string,
          (input.state as "open" | "closed" | "all" | undefined) ?? "open",
          Number(input.per_page ?? 15)
        );

      case "github_get_pull":
        return github.getPullRequest(
          context.userId,
          input.owner as string,
          input.repo as string,
          Number(input.number)
        );

      // ─── Marcus — legal tools ──────────────────────────────────────────
      case "analyze_document": {
        const docTier = await getUserTier(context.supabase, context.userId);
        if (docTier === "free") {
          return "TOOL_ERROR: Document analysis requires a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry.";
        }
        const documentId = ((input.document_id as string) ?? "").trim();
        if (!documentId) return "TOOL_ERROR: document_id is required. STOP.";
        try {
          return await legal.analyzeDocumentForAgent(
            context.supabase,
            context.userId,
            documentId
          );
        } catch (err) {
          if (err instanceof legal.MarcusDocumentNotFoundError) {
            return `TOOL_ERROR: ${err.message} The user must attach the document via the paperclip in chat first. STOP. Do not retry.`;
          }
          throw err;
        }
      }

      case "review_contract": {
        const reviewTier = await getUserTier(context.supabase, context.userId);
        if (reviewTier === "free") {
          return "TOOL_ERROR: Contract review requires a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry.";
        }
        const documentId = ((input.document_id as string) ?? "").trim();
        if (!documentId) return "TOOL_ERROR: document_id is required. STOP.";
        try {
          return await legal.reviewContractForAgent(
            context.supabase,
            context.userId,
            documentId
          );
        } catch (err) {
          if (err instanceof legal.MarcusDocumentNotFoundError) {
            return `TOOL_ERROR: ${err.message} STOP. Do not retry.`;
          }
          throw err;
        }
      }

      case "draft_legal_document": {
        const draftTier = await getUserTier(context.supabase, context.userId);
        if (draftTier === "free") {
          return "TOOL_ERROR: Legal-document drafting requires a Solo plan or higher. Upgrade at knetc.team/pricing. STOP. Do not retry.";
        }
        const documentType = input.document_type as legal.LegalDocumentType;
        const partiesIn = input.parties as
          | Array<{ name?: string; role?: string; address?: string }>
          | undefined;
        const jurisdiction = ((input.jurisdiction as string) ?? "").trim();
        const keyTerms = (input.key_terms ?? {}) as Record<string, unknown>;
        const format = (input.format as "docx" | "pdf" | undefined) ?? "docx";
        const title = ((input.title as string) ?? "").trim() || undefined;

        const allowedTypes: legal.LegalDocumentType[] = [
          "nda_mutual",
          "nda_one_way",
          "terms_of_service",
          "marketplace_terms_of_service",
          "privacy_policy",
          "msa",
          "founder_agreement",
          "contractor_agreement",
          "employment_offer_letter",
        ];
        if (!documentType || !allowedTypes.includes(documentType)) {
          return `TOOL_ERROR: invalid document_type. Allowed: ${allowedTypes.join(", ")}. STOP.`;
        }
        if (!Array.isArray(partiesIn) || partiesIn.length === 0) {
          return "TOOL_ERROR: parties array is required and must include at least one named party. STOP.";
        }
        const parties = partiesIn
          .map((p) => ({
            name: (p.name ?? "").trim(),
            role: p.role?.trim(),
            address: p.address?.trim(),
          }))
          .filter((p) => p.name);
        if (parties.length === 0) {
          return "TOOL_ERROR: every party entry must include a non-empty name. STOP.";
        }
        if (!jurisdiction) {
          return "TOOL_ERROR: jurisdiction is required. STOP.";
        }
        if (!["docx", "pdf"].includes(format)) {
          return `TOOL_ERROR: format must be docx or pdf. STOP.`;
        }

        try {
          const result = await legal.draftLegalDocumentForAgent(context.userId, {
            documentType,
            parties,
            jurisdiction,
            keyTerms,
            format,
            title,
          });
          const kb = Math.round(result.sizeBytes / 1024);
          const sizeLabel = kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;

          // Save text rendering for get_agent_output, fire-and-forget.
          void (async () => {
            try {
              const textContent = sectionsToText(result.scaffold.sections);
              if (textContent) {
                const { error } = await context.supabase
                  .from("agent_file_contents")
                  .insert({
                    user_id: context.userId,
                    title: result.filename,
                    format,
                    text_content: textContent,
                  });
                if (error)
                  console.error("[draft_legal_document] content save failed", {
                    error: error.message,
                  });
              }
            } catch (err) {
              console.error("[draft_legal_document] content save threw", {
                error: String(err),
              });
            }
          })();

          return `Legal document drafted (${sizeLabel}). Include this exact markdown link verbatim in your response so the user can download it:\n[${result.filename}](${result.signedUrl})\n\nYou MUST include the markdown link above verbatim. Do not summarise or paraphrase it. The not-legal-advice disclaimer is built into the document.`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[draft_legal_document] failed", { documentType, error: msg });
          return `TOOL_ERROR: Drafting failed: "${msg}". STOP. Do not retry. Tell the user the draft failed and offer to paste the body inline instead.`;
        }
      }

      case "flag_legal_risks": {
        const description = ((input.activity_description as string) ?? "").trim();
        if (!description) return "TOOL_ERROR: activity_description is required. STOP.";
        if (description.length > 8000)
          return "TOOL_ERROR: activity_description too long (max 8000 chars). STOP.";
        return legal.flagLegalRisksScaffold(description);
      }

    default:
      return `Unknown tool: ${name}`;
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
