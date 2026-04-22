"use client";

import { AGENTS, type AgentKey } from "@/lib/agents";

export default function AgentHeader({ agentKey }: { agentKey: AgentKey | "boardroom" }) {
  const isBoardroom = agentKey === "boardroom";
  const agent = !isBoardroom ? AGENTS.find((a) => a.key === agentKey) : null;

  return (
    <div className="sticky top-0 z-10 glass border-b border-apple-gray-100 px-4 py-3 flex items-center gap-3">
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
        style={{ background: isBoardroom ? "#48484A" : (agent?.accent ?? "#48484A") }}
      >
        {isBoardroom ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="5.5" cy="5.5" r="2.8" stroke="white" strokeWidth="1.3" />
            <circle cx="10.5" cy="5.5" r="2.8" stroke="white" strokeWidth="1.3" />
            <path d="M0.5 14c0-2.5 2.2-4.5 5-4.5M10.5 14c0-2.5 2.2-4.5 5-4.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        ) : (
          agent?.initials
        )}
      </div>

      {/* Name + role */}
      <div className="flex-1 min-w-0">
        <div className="text-apple-gray-950 font-semibold text-sm leading-none">
          {isBoardroom ? "Boardroom" : agent?.name}
        </div>
        <div className="text-apple-gray-500 text-xs mt-0.5">
          {isBoardroom ? "Jeremy · Kai · Dana · Marcus" : agent?.role}
        </div>
      </div>

      {/* Status dot */}
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-apple-gray-500">Online</span>
      </div>
    </div>
  );
}
