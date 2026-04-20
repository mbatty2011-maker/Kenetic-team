"use client";

import { AGENTS } from "@/lib/agents";

export default function TypingIndicator({ agentKey }: { agentKey: string }) {
  const agent = AGENTS.find((a) => a.key === agentKey);

  return (
    <div className="flex items-end gap-2 animate-fade-in">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
        style={{ background: agent?.accent || "#48484A" }}
      >
        {agent?.initials ?? "?"}
      </div>
      <div className="px-4 py-3 bg-apple-gray-50 border border-apple-gray-100 rounded-apple-2xl rounded-bl-apple-sm">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full animate-typing-dot"
              style={{
                background: agent?.accent || "#8E8E93",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
