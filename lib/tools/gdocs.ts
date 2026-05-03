import { getGoogleAccessToken } from "./google-auth";

export async function createDocument(
  userId: string,
  title: string,
  content: string
): Promise<{ id: string; url: string; title: string }> {
  const token = await getGoogleAccessToken(userId);

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

  return {
    id: doc.documentId,
    url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
    title,
  };
}
