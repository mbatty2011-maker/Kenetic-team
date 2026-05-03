import { getGoogleAccessToken } from "./google-auth";

export async function createSpreadsheet(
  userId: string,
  title: string,
  sheets: { name: string; data: (string | number)[][] }[]
): Promise<{ id: string; url: string; title: string }> {
  const token = await getGoogleAccessToken(userId);

  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title },
      sheets: sheets.map((s, i) => ({
        properties: { sheetId: i, title: s.name, index: i },
      })),
    }),
  });

  const spreadsheet = await createRes.json();
  if (!spreadsheet.spreadsheetId) {
    throw new Error("Failed to create spreadsheet: " + JSON.stringify(spreadsheet));
  }

  const valueRanges = sheets
    .filter((s) => s.data?.length > 0)
    .map((s) => ({ range: `'${s.name}'!A1`, values: s.data }));

  if (valueRanges.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet.spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: valueRanges }),
      }
    );
  }

  return {
    id: spreadsheet.spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
    title,
  };
}

export async function readSpreadsheet(
  userId: string,
  spreadsheetIdOrUrl: string,
  range = "A1:Z100"
): Promise<string> {
  const token = await getGoogleAccessToken(userId);

  // Accept either a full URL or a bare ID
  const idMatch = spreadsheetIdOrUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const spreadsheetId = idMatch ? idMatch[1] : spreadsheetIdOrUrl;

  const encodedRange = encodeURIComponent(range);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    throw new Error(`Failed to read spreadsheet: ${await res.text()}`);
  }

  const data = await res.json();
  const rows: string[][] = data.values ?? [];
  if (rows.length === 0) return "Spreadsheet is empty or range has no data.";

  return rows.map((row) => row.join("\t")).join("\n");
}
