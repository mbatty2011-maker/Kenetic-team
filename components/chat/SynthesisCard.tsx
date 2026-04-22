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

  return (
    <div className="animate-fade-in my-4">
      <div className="bg-white border border-apple-gray-200 rounded-apple-xl shadow-apple-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-apple-gray-100 flex items-center justify-between flex-wrap gap-2">
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

        {/* Content — full synthesis rendered as markdown */}
        <div className="px-5 py-4 max-h-[480px] overflow-y-auto">
          {content ? (
            <MarkdownContent content={content} />
          ) : (
            <p className="text-sm text-apple-gray-400 italic">No content received.</p>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-apple-gray-100 flex items-center gap-3 flex-wrap">
          {!sent ? (
            <>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 px-4 py-2 bg-apple-gray-950 text-white text-sm font-medium rounded-apple-md hover:bg-apple-gray-800 disabled:opacity-50 transition-all"
              >
                {sending ? (
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
              <button
                onClick={onCancel}
                disabled={sending}
                className="px-4 py-2 text-sm text-apple-gray-600 hover:text-apple-gray-950 rounded-apple-md hover:bg-apple-gray-100 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              {sendError ? (
                <span className="text-xs text-red-600 ml-auto">{sendError}</span>
              ) : userEmail ? (
                <span className="text-xs text-apple-gray-400 ml-auto">To: {userEmail}</span>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7.5L8 3" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-sm text-green-700 font-medium">
                {userEmail ? `Sent to ${userEmail}` : "Brief sent"}
              </span>
              <button
                onClick={onCancel}
                className="ml-auto text-xs text-apple-gray-400 hover:text-apple-gray-600"
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
