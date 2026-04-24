import { Workbook } from "exceljs";
import type { SpreadsheetInput } from "@/lib/files/types";

export async function generateXlsx(input: SpreadsheetInput): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = "Knetc";
  workbook.created = new Date();

  for (const sheet of input.sheets) {
    const headers = sheet.headers ?? [];
    const rows    = sheet.rows    ?? [];
    const ws = workbook.addWorksheet(sheet.name || "Sheet1");

    // Add headers
    ws.addRow(headers);

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, name: "Calibri", size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F0F0" },
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
      cell.alignment = { vertical: "middle" };
    });

    // Freeze header row
    ws.views = [{ state: "frozen", ySplit: 1 }];

    // Add data rows
    for (const row of rows) {
      ws.addRow(row ?? []);
    }

    // Auto-width: measure based on content
    const colCount = headers.length;
    for (let ci = 1; ci <= colCount; ci++) {
      const header = headers[ci - 1] ?? "";
      let maxLen = header.length;
      for (const row of rows) {
        const val = (row ?? [])[ci - 1] ?? "";
        if (val.length > maxLen) maxLen = val.length;
      }
      ws.getColumn(ci).width = Math.min(Math.max(maxLen + 4, 10), 50);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
