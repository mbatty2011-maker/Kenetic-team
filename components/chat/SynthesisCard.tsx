"use client";

import { useState } from "react";
import MarkdownContent from "./MarkdownContent";

interface SynthesisCardProps {
  content: string;
  taskSummary: string;
  userEmail?: string;
  onConfirmSend: () => Promise<void>;
  onCancel: () => void;
}

export default function SynthesisCard({
  content,
  taskSummary,
  userEmail,
  onConfirmSend,
  onCancel,
}: SynthesisCardProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSend() {
    setSending(true);
    setSendError(null);
    try {
      await onConfirmSend();
      setSent(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const monoStyle = { fontFamily: "var(--font-space-mono), monospace" };

  return (
    <div className="animate-fade-in my-4">
      <div className="bg-black border border-white overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1" style={monoStyle}>
              Team Brief — Ready to Send
            </div>
            <div className="text-white text-sm font-bold truncate max-w-xs">
              {taskSummary}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white" />
            <span className="text-xs text-white/50" style={monoStyle}>All agents responded</span>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[480px] overflow-y-auto">
          {content ? (
            <MarkdownContent content={content} />
          ) : (
            <p className="text-sm text-white/40 italic" style={monoStyle}>No content received.</p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-white flex items-center gap-3 flex-wrap">
          {!sent ? (
            <>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 disabled:opacity-40"
                style={monoStyle}
              >
                {sending ? (
                  "Sending..."
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1.5 7L12.5 1.5L8 12.5L7 7.5L1.5 7Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Confirm Send
                  </>
                )}
              </button>
              <button
                onClick={onCancel}
                disabled={sending}
                className="px-4 py-2.5 text-xs border border-white text-white hover:bg-white hover:text-black transition-colors duration-200 disabled:opacity-40"
                style={monoStyle}
              >
                Cancel
              </button>
              {sendError ? (
                <span className="text-xs text-red-400 ml-auto" style={monoStyle}>{sendError}</span>
              ) : userEmail ? (
                <span className="text-xs text-white/30 ml-auto" style={monoStyle}>To: {userEmail}</span>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border border-white flex items-center justify-center bg-white">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7.5L8 3" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-sm text-white font-bold" style={monoStyle}>
                {userEmail ? `Sent to ${userEmail}` : "Brief sent"}
              </span>
              <button
                onClick={onCancel}
                className="ml-auto text-xs text-white/30 hover:text-white transition-colors"
                style={monoStyle}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
