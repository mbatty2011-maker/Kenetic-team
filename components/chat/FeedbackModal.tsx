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

  const monoStyle = { fontFamily: "var(--font-space-mono), monospace" };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80">
      <div className="bg-black border border-white w-full max-w-md overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white">
          <div>
            <h2 className="text-white font-bold text-sm uppercase tracking-widest" style={monoStyle}>
              Give Feedback
            </h2>
            <p className="text-white/40 text-xs mt-0.5" style={monoStyle}>Goes to the developer</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 border border-white flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors duration-200"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {status === "sent" ? (
          <div className="px-5 py-10 text-center space-y-4">
            <div className="w-12 h-12 border border-white flex items-center justify-center mx-auto bg-white">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M5 11l4.5 4.5L17 7" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-white font-bold text-sm uppercase tracking-widest" style={monoStyle}>Feedback sent!</p>
            <p className="text-white/40 text-xs" style={monoStyle}>We&apos;ll look into it shortly.</p>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200"
              style={monoStyle}
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
              className="w-full px-3 py-3 bg-black border border-white text-white text-sm placeholder:text-white/30 resize-none focus:outline-none"
            />

            {status === "error" && (
              <p className="text-xs text-red-400" style={monoStyle}>{errorMsg}</p>
            )}

            <button
              onClick={submit}
              disabled={!content.trim() || status === "sending"}
              className="w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 disabled:opacity-30"
              style={monoStyle}
            >
              {status === "sending" ? "Sending..." : "Send Feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
