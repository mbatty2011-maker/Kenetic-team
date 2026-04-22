import { getGoogleAccessToken } from "./google-auth";
const getAccessToken = getGoogleAccessToken;

export async function createDocument(
  title: string,
  content: string
): Promise<{ id: string; url: string; title: string }> {
  const token = await getAccessToken();

  const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  const doc = await createRes.json();
  if (!doc.documentId) throw new Error("Failed to create document: " + JSON.stringify(doc));

  await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ insertText: { location: { index: 1 }, text: content } }],
    }),
  });

  // Share with the account owner so the file is always accessible
  const shareEmail = process.env.GMAIL_FROM_ADDRESS ?? "";
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${doc.documentId}/permissions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "writer", type: "user", emailAddress: shareEmail }),
    }
  );

  return {
    id: doc.documentId,
    url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
    title,
  };
}
