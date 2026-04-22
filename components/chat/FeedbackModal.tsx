"use client";

import { useState } from "react";

export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit() {
    if (!content.trim() || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to send feedback");
      }
      setStatus("sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-apple-2xl shadow-apple-xl w-full max-w-md overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-apple-gray-100">
          <div>
            <h2 className="text-apple-gray-950 font-semibold text-base">Give Feedback</h2>
            <p className="text-apple-gray-400 text-xs mt-0.5">Goes to the developer</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-apple-gray-100 flex items-center justify-center text-apple-gray-500 hover:bg-apple-gray-200 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {status === "sent" ? (
          <div className="px-5 py-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M5 11l4.5 4.5L17 7" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-apple-gray-950 font-semibold">Feedback sent!</p>
            <p className="text-apple-gray-500 text-sm">We&apos;ll look into it shortly.</p>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2 bg-apple-gray-950 text-white text-sm font-semibold rounded-apple-lg hover:bg-apple-gray-800 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's working, what's broken, what you'd love to see..."
              rows={5}
              autoFocus
              className="w-full px-3 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-apple-lg text-sm text-apple-gray-950 placeholder-apple-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-apple-gray-300 transition-all"
            />

            {status === "error" && (
              <p className="text-xs text-red-600">{errorMsg}</p>
            )}

            <button
              onClick={submit}
              disabled={!content.trim() || status === "sending"}
              className="w-full py-2.5 bg-apple-gray-950 text-white text-sm font-semibold rounded-apple-lg hover:bg-apple-gray-800 disabled:opacity-40 transition-all"
            >
              {status === "sending" ? "Sending..." : "Send Feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
