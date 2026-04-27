"use client";

import { useState, useRef, useEffect } from "react";
import { AGENTS } from "@/lib/agents";

const MAX_CHARS = 32000;
const WARN_AT = MAX_CHARS * 0.5;

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
  const charCount = value.length;
  const showCounter = charCount >= WARN_AT;
  const isOverLimit = charCount > MAX_CHARS;

  useEffect(() => {
    adjustHeight();
  }, [value]);

  function adjustHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 20 * 5 + 24;
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
    if (!trimmed || isLoading || isOverLimit) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <div
        className={`bg-black border flex items-end gap-2 px-3 py-2 ${
          isOverLimit ? "border-red-500" : "border-white"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder={`Message ${agentKey === "boardroom" ? "Boardroom" : (agent?.name ?? "")}...`}
          rows={1}
          className="flex-1 text-sm text-white placeholder:text-white/30 leading-5 py-1 bg-transparent disabled:opacity-50 focus:outline-none resize-none"
          style={{ minHeight: "28px", maxHeight: "120px" }}
        />

        <div className="flex items-center gap-2 flex-shrink-0 mb-0.5">
          {showCounter && (
            <span
              className={`text-[10px] tabular-nums transition-colors ${
                isOverLimit ? "text-red-400 font-bold" : "text-white/40"
              }`}
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {charCount.toLocaleString()}/{MAX_CHARS.toLocaleString()}
            </span>
          )}
          <button
            onClick={handleSend}
            disabled={!value.trim() || isLoading || isOverLimit}
            className="w-8 h-8 flex items-center justify-center text-black bg-white border border-white hover:bg-black hover:text-white transition-colors duration-200 disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 7L7 2L12 7M7 2V12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <p
        className="text-center text-xs text-white/30 mt-1.5"
        style={{ fontFamily: "var(--font-space-mono), monospace" }}
      >
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
