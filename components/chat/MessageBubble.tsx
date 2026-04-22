"use client";

import { useState } from "react";
import { AGENTS } from "@/lib/agents";
import MarkdownContent from "./MarkdownContent";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent_key?: string;
  created_at: string;
  isStreaming?: boolean;
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({
  message,
  currentAgentKey,
}: {
  message: Message;
  currentAgentKey: string;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const senderAgent = message.agent_key
    ? AGENTS.find((a) => a.key === message.agent_key)
    : null;

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  if (isSystem) {
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-apple-gray-50 rounded-full border border-apple-gray-100">
          <div className="w-1.5 h-1.5 rounded-full bg-apple-gray-400" />
          <span className="text-xs text-apple-gray-500">{message.content}</span>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end items-end gap-2 animate-slide-in-right group">
        <span className="text-[10px] text-apple-gray-400 opacity-0 group-hover:opacity-100 transition-opacity mb-0.5 flex-shrink-0">
          {formatTimestamp(message.created_at)}
        </span>
        <div
          className="max-w-[75%] px-4 py-2.5 rounded-apple-2xl rounded-br-apple-sm text-white text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ background: senderAgent?.accent || "#1C1C1E" }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 animate-slide-in-left group">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mt-0.5"
        style={{ background: senderAgent?.accent || "#48484A" }}
      >
        {senderAgent?.initials ?? "?"}
      </div>

      <div className="max-w-[78%] min-w-0">
        {currentAgentKey === "boardroom" && senderAgent && (
          <div
            className="text-xs font-semibold mb-1.5 ml-0.5"
            style={{ color: senderAgent.accent }}
          >
            {senderAgent.name} · {senderAgent.role}
          </div>
        )}

        <div className="px-4 py-3 rounded-apple-2xl rounded-tl-apple-sm bg-apple-gray-50 border border-apple-gray-100">
          {message.content ? (
            <>
              <MarkdownContent content={message.content} />
              {message.isStreaming && (
                <span className="inline-block w-0.5 h-3.5 bg-apple-gray-400 ml-0.5 animate-pulse align-middle" />
              )}
            </>
          ) : message.isStreaming ? (
            <span className="inline-block w-0.5 h-3.5 bg-apple-gray-400 animate-pulse align-middle" />
          ) : null}
        </div>

        {/* Copy + timestamp — fade in on hover */}
        {!message.isStreaming && message.content && (
          <div className="flex items-center gap-2 mt-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={copyContent}
              className="flex items-center gap-1 text-[10px] text-apple-gray-400 hover:text-apple-gray-700 transition-colors"
            >
              {copied ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <rect x="3.5" y="3.5" width="5" height="5" rx="0.8" stroke="currentColor" strokeWidth="1" />
                    <path d="M6.5 3.5V2.5a.5.5 0 00-.5-.5h-4a.5.5 0 00-.5.5v4a.5.5 0 00.5.5H3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <span className="text-[10px] text-apple-gray-300">
              {formatTimestamp(message.created_at)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
