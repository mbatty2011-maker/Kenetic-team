import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface ParsedDocument {
  text: string;
  pageCount: number;
}

const MAX_PARSED_CHARS = 500_000;

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pageCount = pdf.numPages;
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : text;
  return {
    text: joined.length > MAX_PARSED_CHARS ? joined.slice(0, MAX_PARSED_CHARS) : joined,
    pageCount,
  };
}

export async function parseDocxBuffer(buffer: Buffer): Promise<ParsedDocument> {
  const { value } = await mammoth.extractRawText({ buffer });
  return {
    text: value.length > MAX_PARSED_CHARS ? value.slice(0, MAX_PARSED_CHARS) : value,
    pageCount: 0,
  };
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string
): Promise<ParsedDocument> {
  if (mimeType === PDF_MIME) return parsePdfBuffer(buffer);
  if (mimeType === DOCX_MIME) return parseDocxBuffer(buffer);
  throw new Error(`Unsupported mime type for parsing: ${mimeType}`);
}

export function buildPreview(text: string, maxChars = 2000): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}…` : cleaned;
}
