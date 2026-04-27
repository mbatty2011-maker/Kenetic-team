"use client";

import React from "react";
import FileCard from "./FileCard";

// Lightweight markdown renderer — no external dependencies
export default function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // H1
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-base font-bold text-white mt-3 mb-1.5 first:mt-0 uppercase tracking-wide">
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-sm font-bold text-white mt-3 mb-1 first:mt-0 uppercase tracking-wide">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-sm font-bold text-white/80 mt-2 mb-0.5 first:mt-0">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      elements.push(<hr key={i} className="border-white/20 my-3" />);
      i++;
      continue;
    }

    // Table
    if (line.includes("|") && lines[i + 1]?.match(/^\|?[\s\-|]+\|?$/)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(renderTable(tableLines, i));
      continue;
    }

    // Unordered list
    if (line.match(/^[-*+] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*+] /)) {
        items.push(lines[i].replace(/^[-*+] /, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="mb-2 space-y-0.5 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 bg-white flex-shrink-0" />
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="mb-2 space-y-0.5 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed">
              <span
                className="flex-shrink-0 font-bold text-white/60 text-xs w-4 mt-0.5"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                {idx + 1}.
              </span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const meta = line.slice(3).trim();
      const metaParts = meta.split(/\s+/);
      const lang = metaParts[0] || "txt";
      const filename = metaParts[1] || null;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const codeText = codeLines.join("\n");
      const downloadName = filename ?? `code.${lang}`;
      elements.push(
        <div key={`code-${i}`} className="my-2 border border-white/30 overflow-hidden">
          <div className="flex items-center justify-between bg-white/5 px-3 py-1.5">
            <span
              className="text-xs text-white/50"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {filename ?? lang}
            </span>
            <button
              onClick={() => {
                const blob = new Blob([codeText], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = downloadName;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs text-white/60 hover:text-white font-bold transition-colors"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              Download
            </button>
          </div>
          <pre className="bg-black px-3 py-2.5 overflow-x-auto">
            <code
              className="text-xs text-white/80"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {codeText}
            </code>
          </pre>
        </div>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-2 border-white/40 pl-3 text-white/60 italic my-2 text-sm">
          {quoteLines.map((l, idx) => <p key={idx}>{renderInline(l)}</p>)}
        </blockquote>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm leading-relaxed mb-1.5 last:mb-0">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5 text-white">{elements}</div>;
}

function renderTable(rows: string[], keyBase: number): React.ReactNode {
  const parsed = rows.map((r) =>
    r.split("|").filter((_, i, arr) => !(i === 0 && arr[0] === "") && !(i === arr.length - 1 && arr[arr.length - 1] === "")).map((c) => c.trim())
  );
  const header = parsed[0];
  const body = parsed.slice(2);

  return (
    <div key={`table-${keyBase}`} className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse border border-white/20">
        <thead>
          <tr className="bg-white/10">
            {header.map((cell, i) => (
              <th key={i} className="px-3 py-1.5 text-left font-bold text-white border border-white/20"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}>
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-transparent" : "bg-white/5"}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 border border-white/20 text-white/80">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={match.index} className="font-bold text-white">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index} className="italic">{match[4]}</em>);
    } else if (match[5]) {
      parts.push(
        <code
          key={match.index}
          className="bg-white/10 px-1 py-0.5 text-xs"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      const href = match[9];
      const text = match[8];
      if (href.includes("/storage/v1/object/sign/agent-files/")) {
        parts.push(<FileCard key={match.index} href={href} filename={text} />);
      } else {
        parts.push(
          <a key={match.index} href={href} className="text-white underline hover:text-white/70 transition-colors" target="_blank" rel="noopener noreferrer">
            {text}
          </a>
        );
      }
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length === 1 ? parts[0] : parts;
}
