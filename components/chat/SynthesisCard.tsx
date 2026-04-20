"use client";

import { useState } from "react";

interface SynthesisCardProps {
  content: string;
  taskSummary: string;
  onConfirmSend: () => Promise<void>;
  onCancel: () => void;
}

export default function SynthesisCard({
  content,
  taskSummary,
  onConfirmSend,
  onCancel,
}: SynthesisCardProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setSending(true);
    await onConfirmSend();
    setSent(true);
    setSending(false);
  }

  // Parse sections from the content
  const sections = parseSection(content);

  return (
    <div className="animate-fade-in my-4">
      <div className="bg-white border border-apple-gray-200 rounded-apple-xl shadow-apple-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-apple-gray-100 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-1">
              Team Brief — Ready to Send
            </div>
            <div className="text-sm font-semibold text-apple-gray-950 truncate max-w-xs">
              {taskSummary}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-apple-gray-500">All agents responded</span>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-96 overflow-y-auto space-y-4">
          {sections.length > 0 ? (
            sections.map((section, i) => (
              <div key={i}>
                {section.header && (
                  <div className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider mb-2">
                    {section.header}
                  </div>
                )}
                <p className="text-sm text-apple-gray-800 leading-relaxed whitespace-pre-wrap">
                  {section.content}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-apple-gray-800 leading-relaxed whitespace-pre-wrap">
              {content}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-apple-gray-100 flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || sent}
            className="flex items-center gap-2 px-4 py-2 bg-apple-gray-950 text-white text-sm font-medium rounded-apple-md hover:bg-apple-gray-800 disabled:opacity-50 transition-all"
          >
            {sent ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7L5.5 10.5L12 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sent
              </>
            ) : sending ? (
              "Sending..."
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1.5 7L12.5 1.5L8 12.5L7 7.5L1.5 7Z" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Confirm Send
              </>
            )}
          </button>

          {!sent && (
            <button
              onClick={onCancel}
              disabled={sending}
              className="px-4 py-2 text-sm text-apple-gray-600 hover:text-apple-gray-950 rounded-apple-md hover:bg-apple-gray-100 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          <span className="text-xs text-apple-gray-400 ml-auto">
            To: mbatty2011@gmail.com
          </span>
        </div>
      </div>
    </div>
  );
}

function parseSection(content: string) {
  const sectionHeaders = [
    "TASK:",
    "DATE:",
    "FINANCIAL PERSPECTIVE",
    "TECHNICAL PERSPECTIVE",
    "SALES & PARTNERSHIPS",
    "LEGAL & COMPLIANCE",
    "RECOMMENDED NEXT STEPS",
  ];

  const lines = content.split("\n");
  const sections: { header: string; content: string }[] = [];
  let currentHeader = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const isHeader = sectionHeaders.some((h) => line.trim().startsWith(h));
    if (isHeader) {
      if (currentLines.length > 0 && (currentHeader || currentLines.some((l) => l.trim()))) {
        sections.push({ header: currentHeader, content: currentLines.join("\n").trim() });
      }
      currentHeader = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({ header: currentHeader, content: currentLines.join("\n").trim() });
  }

  return sections.filter((s) => s.content);
}
