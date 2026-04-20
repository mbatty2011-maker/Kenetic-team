"use client";

import { useState, useRef, useEffect } from "react";
import { AGENTS } from "@/lib/agents";

export default function ChatInput({
  onSend,
  isLoading,
  agentKey,
}: {
  onSend: (message: string) => void;
  isLoading: boolean;
  agentKey: string;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agent = AGENTS.find((a) => a.key === agentKey);

  useEffect(() => {
    adjustHeight();
  }, [value]);

  function adjustHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 20;
    const maxLines = 5;
    const maxHeight = lineHeight * maxLines + 24;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  const accentColor = agent?.accent || "#1C1C1E";

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="bg-white rounded-apple-xl border border-apple-gray-200 shadow-apple-sm flex items-end gap-2 px-3 py-2 focus-within:border-apple-gray-400 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder={`Message ${agentKey === "boardroom" ? "Boardroom" : agent?.name ?? ""}...`}
          rows={1}
          className="flex-1 text-sm text-apple-gray-950 placeholder:text-apple-gray-400 leading-5 py-1 bg-transparent disabled:opacity-50"
          style={{ minHeight: "28px", maxHeight: "120px" }}
        />

        <button
          onClick={handleSend}
          disabled={!value.trim() || isLoading}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-30 hover:opacity-80 active:scale-95 mb-0.5"
          style={{ background: accentColor }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 7L7 2L12 7M7 2V12"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <p className="text-center text-xs text-apple-gray-400 mt-1.5">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
