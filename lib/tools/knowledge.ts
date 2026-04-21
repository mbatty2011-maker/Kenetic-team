async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get access token: " + JSON.stringify(data));
  return data.access_token;
}

export async function readKnowledgeBase(): Promise<string> {
  const docId = process.env.KNOWLEDGE_BASE_DOC_ID;
  if (!docId) return "";

  try {
    const token = await getAccessToken();
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return "";
    const doc = await res.json();

    // Extract plain text from the doc body
    let text = "";
    for (const element of doc.body?.content ?? []) {
      if (element.paragraph) {
        for (const el of element.paragraph.elements ?? []) {
          if (el.textRun?.content) text += el.textRun.content;
        }
      }
      if (element.table) {
        for (const row of element.table.tableRows ?? []) {
          for (const cell of row.tableCells ?? []) {
            for (const p of cell.content ?? []) {
              for (const el of p.paragraph?.elements ?? []) {
                if (el.textRun?.content) text += el.textRun.content + "\t";
              }
            }
          }
          text += "\n";
        }
      }
    }
    return text.trim();
  } catch {
    return "";
  }
}

export async function appendToKnowledgeBase(section: string, content: string): Promise<void> {
  const docId = process.env.KNOWLEDGE_BASE_DOC_ID;
  if (!docId) throw new Error("KNOWLEDGE_BASE_DOC_ID not set");

  const token = await getAccessToken();

  // Get current doc end index
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const doc = await res.json();
  const endIndex = doc.body?.content?.slice(-1)[0]?.endIndex ?? 1;
  const insertIndex = Math.max(1, endIndex - 1);

  const text = `\n\n## ${section}\n${content}\n`;

  await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: insertIndex }, text } }],
    }),
  });
}
