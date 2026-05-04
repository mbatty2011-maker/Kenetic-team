"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const DISCLOSURE_KEY = "computer_use_disclosed";

type ComputerStep = {
  timestamp: string;
  type: "status" | "action" | "warning" | "error" | "done";
  summary: string;
  detail?: string;
};

type ComputerJob = {
  id: string;
  user_id: string;
  status: "queued" | "running" | "complete" | "failed" | "expired";
  task: string;
  sandbox_id: string | null;
  stream_url: string | null;
  steps: ComputerStep[];
  result: string | null;
  error: string | null;
};

const monoStyle = { fontFamily: "var(--font-space-mono), monospace" } as const;

function actionEmoji(action: string): string {
  if (action === "screenshot") return "📷";
  if (action === "click" || action === "double_click" || action === "right_click") return "🖱️";
  if (action === "type" || action === "key") return "⌨️";
  if (action === "scroll") return "↕️";
  if (action === "open") return "🌐";
  return "⚡";
}

function DisclosureModal({ onAccept, onCancel }: { onAccept: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
      <div className="bg-black border border-white max-w-md w-full p-5">
        <h2 className="text-sm font-bold text-white mb-3" style={monoStyle}>Before Alex opens a desktop</h2>
        <ul className="text-xs text-white/70 space-y-2 mb-4 list-none" style={monoStyle}>
          <li>· Screenshots of the agent&apos;s screen are sent to Anthropic&apos;s API.</li>
          <li>· The agent takes <strong>real actions</strong> — clicks and form submissions are live.</li>
          <li>· Alex will not visit pages that need passwords, banking info, or login.</li>
        </ul>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 border border-white/30 text-white/60 text-xs font-bold py-2 hover:border-white hover:text-white transition-colors"
            style={monoStyle}
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            className="flex-1 bg-white text-black text-xs font-bold py-2 hover:bg-white/90 transition-colors"
            style={monoStyle}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DesktopSessionPanel({ jobId }: { jobId: string }) {
  const supabase = createClient();
  const [job, setJob] = useState<ComputerJob | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [hideStream, setHideStream] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [stopping, setStopping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stepsScrollRef = useRef<HTMLDivElement>(null);

  // ── Disclosure check on mount (one-time per browser) ──────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(DISCLOSURE_KEY)) {
      setShowDisclosure(true);
    }
  }, []);

  // ── Initial hydration + Realtime subscription ─────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).rpc("get_computer_job", {
        p_job_id: jobId,
        p_user_id: user.id,
      });
      if (!cancelled && data) {
        setJob(data as ComputerJob);
      }
    }

    function subscribe() {
      const ch = supabase
        .channel(`computer-job-${jobId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "computer_jobs",
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            const next = payload.new as ComputerJob | undefined;
            if (next) setJob(next);
          },
        )
        .subscribe();
      channelRef.current = ch;
    }

    hydrate();
    subscribe();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // ── Auto-scroll the steps feed ─────────────────────────────────────────────
  useEffect(() => {
    if (stepsScrollRef.current) {
      stepsScrollRef.current.scrollTop = stepsScrollRef.current.scrollHeight;
    }
  }, [job?.steps?.length]);

  // ── Auto-collapse iframe when terminal ─────────────────────────────────────
  useEffect(() => {
    const status = job?.status;
    if (status === "complete" || status === "failed" || status === "expired") {
      setHideStream(true);
    }
  }, [job?.status]);

  function acceptDisclosure() {
    localStorage.setItem(DISCLOSURE_KEY, "1");
    setShowDisclosure(false);
  }

  function cancelDisclosure() {
    setShowDisclosure(false);
    setHideStream(true);
  }

  async function stop() {
    if (!job || stopping) return;
    setStopping(true);
    try {
      await fetch(`/api/computer-use/${job.id}/stop`, { method: "POST" });
    } catch {
      // Realtime sub will eventually reflect the actual state; nothing else to do here.
    }
    // We don't reset stopping — the Realtime update will flip status terminal,
    // at which point the Stop button is replaced by the result row.
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!job) {
    return (
      <div className="border border-white/20 bg-black px-3 py-3" style={monoStyle}>
        <span className="text-[11px] text-white/40">Opening desktop…</span>
      </div>
    );
  }

  const isActive = job.status === "queued" || job.status === "running";
  const isTerminal = !isActive;
  const showStream = !hideStream && job.stream_url && isActive;

  const statusLabel =
    job.status === "queued" ? "Queued…" :
    job.status === "running" ? "Working…" :
    job.status === "complete" ? "Done" :
    job.status === "failed" ? "Failed" :
    "Expired";

  const statusColor =
    job.status === "complete" ? "text-green-400" :
    job.status === "failed" || job.status === "expired" ? "text-red-400" :
    "text-white/60";

  return (
    <>
      {showDisclosure && <DisclosureModal onAccept={acceptDisclosure} onCancel={cancelDisclosure} />}

      <div className="border border-white/30 bg-black">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/15">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-white/50 flex-shrink-0" style={monoStyle}>
              🖥 Desktop
            </span>
            {isActive && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="animate-spin text-white/50 flex-shrink-0" style={{ animationDuration: "1.5s" }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" />
              </svg>
            )}
            <span className={`text-[11px] flex-shrink-0 ${statusColor}`} style={monoStyle}>
              {statusLabel}
            </span>
          </div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-[10px] text-white/40 hover:text-white transition-colors flex-shrink-0"
            style={monoStyle}
          >
            {expanded ? "hide" : "show"}
          </button>
        </div>

        {expanded && (
          <>
            {/* Task */}
            <div className="px-3 py-2 border-b border-white/10">
              <p className="text-[10px] text-white/40 mb-0.5" style={monoStyle}>TASK</p>
              <p className="text-xs text-white/80 line-clamp-3" style={monoStyle}>
                {job.task}
              </p>
            </div>

            {/* Live VNC stream (active only) */}
            {showStream && job.stream_url && (
              <div className="relative w-full bg-black">
                <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
                  <iframe
                    src={job.stream_url}
                    className="absolute inset-0 w-full h-full border-0"
                    allow=""
                    sandbox="allow-scripts allow-forms"
                    title="Live desktop"
                  />
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 pointer-events-none select-none border border-white/20" style={monoStyle}>
                    LIVE · view only
                  </div>
                </div>
              </div>
            )}

            {/* Step feed */}
            <div ref={stepsScrollRef} className="max-h-48 overflow-y-auto px-3 py-2 space-y-1 dark-scrollbar">
              {job.steps.length === 0 && (
                <p className="text-[11px] text-white/30" style={monoStyle}>Waiting for first action…</p>
              )}
              {job.steps.map((step, i) => {
                const emoji =
                  step.type === "action" ? actionEmoji(step.summary) :
                  step.type === "status" ? "·" :
                  step.type === "warning" ? "⚠" :
                  step.type === "error" ? "❌" :
                  step.type === "done" ? "✓" :
                  "·";
                const labelColor =
                  step.type === "warning" ? "text-amber-400" :
                  step.type === "error" ? "text-red-400" :
                  step.type === "done" ? "text-green-400" :
                  step.type === "status" ? "text-white/40" :
                  "text-white/70";
                return (
                  <div key={i} className="flex items-start gap-1.5 min-w-0">
                    <span className="text-[11px] flex-shrink-0 mt-px">{emoji}</span>
                    <div className="min-w-0 flex-1">
                      <span className={`text-[11px] ${labelColor}`} style={monoStyle}>
                        {step.summary.replace(/_/g, " ")}
                      </span>
                      {step.detail && (
                        <span className="text-[10px] text-white/30 ml-1.5" style={monoStyle}>
                          {step.detail}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer: Stop button (active) or Result (terminal) */}
            {isActive && (
              <div className="px-3 py-2 border-t border-white/10">
                <button
                  onClick={stop}
                  disabled={stopping}
                  className="w-full border border-red-500/50 text-red-400 text-[11px] font-bold py-1.5 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                  style={monoStyle}
                >
                  {stopping ? "Stopping…" : "Stop session"}
                </button>
              </div>
            )}

            {isTerminal && job.status === "complete" && job.result && (
              <div className="px-3 py-2 border-t border-white/10">
                <p className="text-[10px] text-green-400/70 mb-0.5" style={monoStyle}>RESULT</p>
                <p className="text-xs text-white/80 whitespace-pre-wrap" style={monoStyle}>
                  {job.result}
                </p>
              </div>
            )}

            {isTerminal && (job.status === "failed" || job.status === "expired") && (
              <div className="px-3 py-2 border-t border-white/10">
                <p className="text-[10px] text-red-400/70 mb-0.5" style={monoStyle}>ERROR</p>
                <p className="text-xs text-red-400 whitespace-pre-wrap" style={monoStyle}>
                  {job.error ?? "Session ended unexpectedly."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
