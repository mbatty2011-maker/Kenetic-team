import { getGoogleAccessToken } from "./google-auth";

const BASE = "https://gmail.googleapis.com/gmail/v1";

async function gmailFetch(path: string, init: RequestInit = {}) {
  const token = await getGoogleAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data)
      ? JSON.stringify((data as { error: unknown }).error)
      : text || res.statusText;
    throw new Error(`Gmail API ${res.status}: ${msg}`);
  }
  return data;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

type GmailHeader = { name: string; value: string };

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

type GmailMessageResource = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
  internalDate?: string;
};

type GmailThreadResource = {
  id: string;
  snippet?: string;
  messages?: GmailMessageResource[];
};

function findHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const match = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return match?.value ?? "";
}

function extractTextPlain(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return base64UrlDecode(part.body.data);
  }
  if (part.parts) {
    for (const sub of part.parts) {
      const text = extractTextPlain(sub);
      if (text) return text;
    }
  }
  return "";
}

export type GmailThreadSummary = {
  id: string;
  snippet: string;
  subject: string;
  from: string;
};

export async function searchThreads(
  query: string,
  maxResults = 10
): Promise<GmailThreadSummary[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
  });
  const data = await gmailFetch(`/users/me/threads?${params}`) as {
    threads?: { id: string; snippet?: string }[];
  };
  const threads = data.threads ?? [];
  if (threads.length === 0) return [];

  // Fetch first message of each thread for subject/from
  const summaries = await Promise.all(threads.slice(0, maxResults).map(async (t) => {
    try {
      const thread = await gmailFetch(
        `/users/me/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`
      ) as GmailThreadResource;
      const first = thread.messages?.[0];
      const headers = first?.payload?.headers;
      return {
        id: t.id,
        snippet: thread.snippet ?? t.snippet ?? "",
        subject: findHeader(headers, "Subject"),
        from: findHeader(headers, "From"),
      };
    } catch {
      return { id: t.id, snippet: t.snippet ?? "", subject: "", from: "" };
    }
  }));
  return summaries;
}

export type GmailMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
};

export async function getThread(threadId: string): Promise<{
  id: string;
  messages: GmailMessage[];
}> {
  const data = await gmailFetch(`/users/me/threads/${threadId}?format=full`) as GmailThreadResource;
  const messages: GmailMessage[] = (data.messages ?? []).map((m) => {
    const headers = m.payload?.headers;
    return {
      id: m.id,
      from: findHeader(headers, "From"),
      to: findHeader(headers, "To"),
      subject: findHeader(headers, "Subject"),
      date: findHeader(headers, "Date"),
      body: extractTextPlain(m.payload).trim(),
    };
  });
  return { id: data.id, messages };
}

export type GmailDraftSummary = {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
};

export async function listDrafts(maxResults = 20): Promise<GmailDraftSummary[]> {
  const params = new URLSearchParams({
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
  });
  const data = await gmailFetch(`/users/me/drafts?${params}`) as {
    drafts?: { id: string; message?: { id: string; threadId: string } }[];
  };
  const drafts = data.drafts ?? [];
  if (drafts.length === 0) return [];

  const summaries = await Promise.all(drafts.map(async (d) => {
    try {
      const detail = await gmailFetch(
        `/users/me/drafts/${d.id}?format=metadata&metadataHeaders=Subject`
      ) as { id: string; message?: GmailMessageResource };
      const subject = findHeader(detail.message?.payload?.headers, "Subject");
      return {
        id: detail.id,
        threadId: detail.message?.threadId ?? "",
        subject,
        snippet: detail.message?.snippet ?? "",
      };
    } catch {
      return { id: d.id, threadId: d.message?.threadId ?? "", subject: "", snippet: "" };
    }
  }));
  return summaries;
}

export async function createDraft(args: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<{ id: string; threadId: string }> {
  const headers = [
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ].join("\r\n");
  const raw = base64UrlEncode(`${headers}\r\n\r\n${args.body}`);

  const data = await gmailFetch("/users/me/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw,
        ...(args.threadId ? { threadId: args.threadId } : {}),
      },
    }),
  }) as { id: string; message?: { threadId: string } };

  return { id: data.id, threadId: data.message?.threadId ?? "" };
}

export type GmailLabel = { id: string; name: string; type: string };

export async function listLabels(): Promise<GmailLabel[]> {
  const data = await gmailFetch("/users/me/labels") as {
    labels?: { id: string; name: string; type: string }[];
  };
  return (data.labels ?? []).map((l) => ({ id: l.id, name: l.name, type: l.type }));
}

export async function createLabel(name: string): Promise<{ id: string; name: string }> {
  const data = await gmailFetch("/users/me/labels", {
    method: "POST",
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  }) as { id: string; name: string };
  return { id: data.id, name: data.name };
}

export async function labelMessage(
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[] = []
): Promise<void> {
  await gmailFetch(`/users/me/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function unlabelMessage(messageId: string, labelIds: string[]): Promise<void> {
  await gmailFetch(`/users/me/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: [], removeLabelIds: labelIds }),
  });
}

export async function labelThread(
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[] = []
): Promise<void> {
  await gmailFetch(`/users/me/threads/${threadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

export async function unlabelThread(threadId: string, labelIds: string[]): Promise<void> {
  await gmailFetch(`/users/me/threads/${threadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ addLabelIds: [], removeLabelIds: labelIds }),
  });
}
