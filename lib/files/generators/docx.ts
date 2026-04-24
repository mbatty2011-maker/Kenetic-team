import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DocumentInput, DocumentSection } from "@/lib/files/types";

const INCH = 1440; // twips per inch

type DocChild = Paragraph | Table;

function sectionToChildren(section: DocumentSection): DocChild[] {
  switch (section.type) {
    case "heading": {
      const level =
        section.level === 1
          ? HeadingLevel.HEADING_1
          : section.level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
      return [
        new Paragraph({
          text: section.text ?? "",
          heading: level,
          spacing: { before: section.level === 1 ? 360 : 240, after: 120 },
        }),
      ];
    }

    case "paragraph":
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: section.text ?? "",
              bold: section.bold,
              italics: section.italic,
            }),
          ],
          spacing: { after: 120 },
        }),
      ];

    case "bullet_list":
      return (section.items ?? []).map(
        (item) =>
          new Paragraph({
            text: item ?? "",
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
      );

    case "numbered_list":
      return (section.items ?? []).map(
        (item, i) =>
          new Paragraph({
            children: [
              new TextRun({ text: `${i + 1}. `, bold: true }),
              new TextRun({ text: item ?? "" }),
            ],
            indent: { left: 360 },
            spacing: { after: 60 },
          })
      );

    case "table": {
      const headers = section.headers ?? [];
      const rows    = section.rows    ?? [];

      const cellBorder = {
        top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      };

      const headerRow = new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              borders: cellBorder,
              shading: { fill: "F0F0F0", type: ShadingType.CLEAR, color: "auto" },
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h ?? "", bold: true })],
                  alignment: AlignmentType.LEFT,
                }),
              ],
            })
        ),
      });

      const dataRows = rows.map(
        (row) =>
          new TableRow({
            children: (row ?? []).map(
              (cell) =>
                new TableCell({
                  borders: cellBorder,
                  margins: { top: 60, bottom: 60, left: 120, right: 120 },
                  children: [new Paragraph({ text: cell ?? "" })],
                })
            ),
          })
      );

      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...dataRows],
        }),
        new Paragraph({ text: "", spacing: { after: 120 } }),
      ];
    }

    default:
      return [];
  }
}

export async function generateDocx(input: DocumentInput): Promise<Buffer> {
  const titleParagraph = new Paragraph({
    text: input.title,
    heading: HeadingLevel.TITLE,
    spacing: { after: 240 },
  });

  const bodyChildren: DocChild[] = [];
  for (const section of input.sections) {
    bodyChildren.push(...sectionToChildren(section));
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 }, // 11pt = 22 half-points
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: INCH, bottom: INCH, left: INCH, right: INCH },
          },
        },
        children: [titleParagraph, ...bodyChildren],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
