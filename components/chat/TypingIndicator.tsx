"use client";

import { AGENTS } from "@/lib/agents";

export default function TypingIndicator({ agentKey }: { agentKey: string }) {
  const agent = AGENTS.find((a) => a.key === agentKey);

  return (
    <div className="flex items-end gap-2 animate-fade-in">
      <div className="w-7 h-7 border border-white flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-black">
        {agent?.initials ?? "?"}
      </div>
      <div className="px-4 py-3 bg-black border border-white">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-white animate-typing-dot"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
