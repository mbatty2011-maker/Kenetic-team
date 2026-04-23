export type DocumentSection =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string; bold?: boolean; italic?: boolean }
  | { type: "bullet_list"; items: string[] }
  | { type: "numbered_list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface DocumentInput {
  title: string;
  sections: DocumentSection[];
}

export interface XlsxSheet {
  name: string;
  headers: string[];
  rows: string[][];
}

export interface SpreadsheetInput {
  title: string;
  sheets: XlsxSheet[];
}
