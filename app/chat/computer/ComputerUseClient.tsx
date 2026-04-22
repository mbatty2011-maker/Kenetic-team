"use client";

import { useState, useRef, useEffect } from "react";

type ActionEvent = {
  type: "status" | "stream_ready" | "action" | "thinking" | "done" | "error";
  message?: string;
  streamUrl?: string;
  action?: string;
  coordinate?: [number, number];
  text?: string;
  result?: string;
};

function actionLabel(event: ActionEvent): string {
  switch (event.action) {
    case "screenshot":    return "Taking screenshot";
    case "left_click":    return `Click at (${event.coordinate?.join(", ")})`;
    case "double_click":  return `Double-click at (${event.coordinate?.join(", ")})`;
    case "right_click":   return `Right-click at (${event.coordinate?.join(", ")})`;
    case "type":          return `Type: "${event.text}"`;
    case "key":           return `Key: ${event.text}`;
    case "scroll":        return `Scroll at (${event.coordinate?.join(", ")})`;
    case "mouse_move":    return `Move mouse to (${event.coordinate?.join(", ")})`;
    default:              return event.action ?? "Action";
  }
}

export default function ComputerUseClient() {
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [feed, setFeed] = useState<ActionEvent[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feed]);

  const appendFeed = (event: ActionEvent) =>
    setFeed((prev) => [...prev, event]);

  async function run() {
    if (!task.trim() || status === "running") return;

    setStatus("running");
    setFeed([]);
    setStreamUrl(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/computer-use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: ActionEvent = JSON.parse(line.slice(6));

            if (event.type === "stream_ready" && event.streamUrl) {
              setStreamUrl(event.streamUrl);
            } else if (event.type === "done") {
              setStatus("done");
              appendFeed(event);
            } else if (event.type === "error") {
              setStatus("error");
              appendFeed(event);
            } else {
              appendFeed(event);
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setStatus("error");
        appendFeed({ type: "error", message: err.message });
      }
    }

    setStatus((s) => s === "running" ? "idle" : s);
  }

  function stop() {
    abortRef.current?.abort();
    setStatus("idle");
  }

  return (
    <div className="flex h-full" style={{ background: "#F5F5F7" }}>
      {/* Left panel — controls + feed */}
      <div className="w-[380px] flex-shrink-0 flex flex-col border-r border-black/8 bg-white">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-black/6">
          <h1 className="font-semibold text-[#1C1C1E] text-base tracking-tight">Computer Use</h1>
          <p className="text-xs text-[#1C1C1E]/40 mt-0.5">Watch the AI work in real time</p>
        </div>

        {/* Task input */}
        <div className="px-4 py-4 border-b border-black/6">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
            }}
            placeholder="Describe what you want the agent to do..."
            rows={4}
            disabled={status === "running"}
            className="w-full text-sm text-[#1C1C1E] bg-[#F5F5F7] border border-black/8 rounded-xl px-3 py-2.5 resize-none outline-none focus:border-black/20 placeholder:text-[#1C1C1E]/30 disabled:opacity-50"
          />
          <div className="flex gap-2 mt-2">
            {status === "running" ? (
              <button
                onClick={stop}
                className="flex-1 bg-red-500 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-red-600 transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={run}
                disabled={!task.trim()}
                className="flex-1 bg-[#1C1C1E] text-white text-sm font-medium py-2.5 rounded-xl hover:bg-black transition-colors disabled:opacity-30"
              >
                Run  <span className="text-white/40 text-xs ml-1">⌘↵</span>
              </button>
            )}
          </div>
        </div>

        {/* Action feed */}
        <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 dark-scrollbar">
          {feed.length === 0 && status === "idle" && (
            <p className="text-xs text-[#1C1C1E]/30 text-center pt-8">
              Enter a task and click Run to start
            </p>
          )}

          {feed.map((event, i) => {
            if (event.type === "status") {
              return (
                <div key={i} className="flex items-center gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1C1C1E]/20 flex-shrink-0" />
                  <span className="text-xs text-[#1C1C1E]/40">{event.message}</span>
                </div>
              );
            }

            if (event.type === "stream_ready") {
              return (
                <div key={i} className="flex items-center gap-2 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-xs text-green-600 font-medium">Desktop connected</span>
                </div>
              );
            }

            if (event.type === "thinking") {
              return (
                <div key={i} className="bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs text-[#1C1C1E]/60 leading-relaxed border-l-2 border-[#1C1C1E]/10">
                  {event.text}
                </div>
              );
            }

            if (event.type === "action") {
              return (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span className="text-sm flex-shrink-0">
                    {event.action === "screenshot" ? "📷" :
                     event.action === "left_click" || event.action === "double_click" ? "🖱️" :
                     event.action === "type" ? "⌨️" :
                     event.action === "key" ? "⌨️" :
                     event.action === "scroll" ? "↕️" : "⚡"}
                  </span>
                  <span className="text-xs text-[#1C1C1E]/70 truncate">{actionLabel(event)}</span>
                </div>
              );
            }

            if (event.type === "done") {
              return (
                <div key={i} className="bg-green-50 border border-green-100 rounded-xl px-3 py-3 mt-2">
                  <div className="text-xs font-semibold text-green-700 mb-1">✓ Complete</div>
                  <p className="text-xs text-green-600 leading-relaxed">{event.result}</p>
                </div>
              );
            }

            if (event.type === "error") {
              return (
                <div key={i} className="bg-red-50 border border-red-100 rounded-xl px-3 py-3 mt-2">
                  <div className="text-xs font-semibold text-red-600 mb-1">Error</div>
                  <p className="text-xs text-red-500 leading-relaxed">{event.message}</p>
                </div>
              );
            }

            return null;
          })}

          {status === "running" && (
            <div className="flex items-center gap-2 py-1 mt-1">
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#1C1C1E]/30 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <span className="text-xs text-[#1C1C1E]/40">Agent working...</span>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — live desktop stream */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F5F5F7] p-6">
        {streamUrl ? (
          <div className="w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-black/8 bg-black">
            <iframe
              src={streamUrl}
              className="w-full h-full border-0"
              allow="clipboard-read; clipboard-write"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              title="Live desktop"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            {status === "running" ? (
              <>
                <div className="w-12 h-12 rounded-full border-2 border-[#1C1C1E]/10 border-t-[#1C1C1E]/60 animate-spin" />
                <p className="text-sm text-[#1C1C1E]/40">Starting desktop environment...</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-[#1C1C1E]/5 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#1C1C1E]/30">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1C1C1E]/50">No active session</p>
                  <p className="text-xs text-[#1C1C1E]/30 mt-1">Run a task to see the live desktop</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
