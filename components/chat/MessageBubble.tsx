"use client";

import { AGENTS } from "@/lib/agents";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent_key?: string;
  created_at: string;
  isStreaming?: boolean;
}

export default function MessageBubble({
  message,
  currentAgentKey,
}: {
  message: Message;
  currentAgentKey: string;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Find the agent who sent this message
  const senderAgent = message.agent_key
    ? AGENTS.find((a) => a.key === message.agent_key)
    : null;

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
      <div className="flex justify-end animate-slide-in-right">
        <div
          className="max-w-[75%] px-4 py-2.5 rounded-apple-2xl rounded-br-apple-sm text-white text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{
            background: senderAgent?.accent || "#1C1C1E",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-end gap-2 animate-slide-in-left">
      {/* Agent avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mb-0.5"
        style={{
          background: senderAgent?.accent || "#48484A",
        }}
      >
        {senderAgent?.initials ?? "?"}
      </div>

      {/* Bubble */}
      <div className="max-w-[75%]">
        {/* Agent name for boardroom */}
        {currentAgentKey === "boardroom" && senderAgent && (
          <div
            className="text-xs font-medium mb-1 ml-1"
            style={{ color: senderAgent.accent }}
          >
            {senderAgent.name} · {senderAgent.role}
          </div>
        )}

        <div
          className={`
            px-4 py-2.5 rounded-apple-2xl rounded-bl-apple-sm
            bg-apple-gray-50 text-apple-gray-950 text-sm leading-relaxed
            whitespace-pre-wrap break-words
            border border-apple-gray-100
            ${message.isStreaming ? "after:content-['▋'] after:ml-0.5 after:animate-pulse" : ""}
          `}
        >
          {message.content || (message.isStreaming ? "" : "...")}
        </div>
      </div>
    </div>
  );
}
