"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AGENTS } from "@/lib/agents";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ChatInput from "./ChatInput";
import AgentHeader from "./AgentHeader";
import SynthesisCard from "./SynthesisCard";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent_key?: string;
  created_at: string;
  isStreaming?: boolean;
}

interface SynthesisData {
  content: string;
  taskSummary: string;
}

interface JobStep {
  timestamp: string;
  type: "thinking" | "tool_call" | "specialist" | "specialist_done" | "warning" | "done" | "error";
  summary: string;
  detail?: string;
}

interface AlexJob {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  prompt: string;
  steps: JobStep[];
  result: string | null;
  error: string | null;
}

const STEP_ICONS: Record<string, string> = {
  thinking:       "💭",
  tool_call:      "🔧",
  specialist:     "🤝",
  specialist_done:"✓",
  warning:        "⚠️",
  done:           "✅",
  error:          "❌",
};

function JobProgressBubble({
  job,
  onRetry,
}: {
  job: AlexJob;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const alex = AGENTS.find((a) => a.key === "alex")!;

  useEffect(() => {
    if (job.status === "complete" || job.status === "failed") {
      setExpanded(false);
    }
  }, [job.status]);

  const isActive = job.status === "queued" || job.status === "running";
  const visibleSteps = job.steps.filter((s) => s.type !== "thinking" || isActive);

  const monoStyle = { fontFamily: "var(--font-space-mono), monospace" };

  return (
    <div className="flex gap-2.5 justify-start">
      <div className="w-7 h-7 border border-white flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 bg-black">
        {alex.initials}
      </div>

      <div className="max-w-[85%] space-y-1.5">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          {isActive && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin text-white flex-shrink-0" style={{ animationDuration: "1.5s" }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" />
            </svg>
          )}
          <span className="text-xs text-white/50" style={monoStyle}>
            {job.status === "queued"  && "Queued…"}
            {job.status === "running" && "Working…"}
            {job.status === "complete" && "Done"}
            {job.status === "failed"  && "Failed"}
          </span>
          {visibleSteps.length > 0 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[11px] text-white/40 hover:text-white transition-colors"
              style={monoStyle}
            >
              {expanded ? "hide steps" : `${visibleSteps.length} steps`}
            </button>
          )}
        </div>

        {/* Step trail */}
        {expanded && visibleSteps.length > 0 && (
          <div className="bg-black border border-white/30 px-3 py-2 space-y-1.5">
            {visibleSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-[11px] flex-shrink-0 mt-px">{STEP_ICONS[step.type] ?? "·"}</span>
                <div className="min-w-0">
                  <span className="text-[11px] text-white/60" style={monoStyle}>{step.summary}</span>
                  {step.detail && step.type !== "thinking" && (
                    <p className="text-[10px] text-white/30 truncate mt-0.5" style={monoStyle}>{step.detail}</p>
                  )}
                </div>
              </div>
            ))}
            {isActive && (
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-white/30">·</span>
                <span className="text-[11px] text-white/30 italic" style={monoStyle}>Still running…</span>
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {job.status === "failed" && (
          <div className="border border-red-500/50 bg-red-950/10 px-3 py-2.5 space-y-2">
            <p className="text-xs text-red-400" style={monoStyle}>{job.error ?? "An error occurred."}</p>
            <button
              onClick={onRetry}
              className="text-xs font-bold text-red-400 underline hover:no-underline"
              style={monoStyle}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AlexChatWindow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());

  const [messages, setMessages] = useState<Message[]>([]);
  const [activeJobs, setActiveJobs] = useState<Map<string, AlexJob>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisData | null>(null);
  const [userEmail, setUserEmail] = useState("");

  const alex = AGENTS.find((a) => a.key === "alex")!;

  // ── Auth + user email ───────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load conversation + resume any active jobs on mount/nav ────────────────
  useEffect(() => {
    const cid = searchParams.get("cid");

    // Unsubscribe from all existing channels when conversation changes
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    channelsRef.current.clear();

    if (cid) {
      setConversationId(cid);
      loadMessages(cid);
      resumeActiveJobs();
    } else {
      setMessages([]);
      setConversationId(null);
      setActiveJobs(new Map());
      setSynthesis(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Scroll to bottom when messages or jobs update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeJobs]);

  // ── Cleanup channels on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async function loadMessages(cid: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true });
    if (data && searchParams.get("cid") === cid) setMessages(data as Message[]);
  }

  // On page load, check for any queued/running jobs for this user and re-subscribe.
  // This ensures the live trail resumes correctly after a tab close/reopen.
  async function resumeActiveJobs() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: jobs } = await (supabase as any).rpc("get_active_alex_jobs", {
      p_user_id: user.id,
    });

    if (!jobs || !Array.isArray(jobs)) return;

    for (const job of jobs as AlexJob[]) {
      setActiveJobs((prev) => new Map(prev).set(job.id, job));
      subscribeToJob(job.id, user.id);
    }
  }

  function subscribeToJob(jobId: string, userId: string) {
    if (channelsRef.current.has(jobId)) return; // already subscribed

    const channel = supabase
      .channel(`alex-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "alex_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const updated = payload.new as AlexJob;
          setActiveJobs((prev) => new Map(prev).set(jobId, updated));

          if (updated.status === "complete" || updated.status === "failed") {
            // Unsubscribe and clean up
            const ch = channelsRef.current.get(jobId);
            if (ch) {
              supabase.removeChannel(ch);
              channelsRef.current.delete(jobId);
            }
            setIsLoading(false);

            // On completion, reload messages so Alex's final message appears
            if (updated.status === "complete") {
              const cid = searchParams.get("cid");
              if (cid) loadMessages(cid);
            }
          }
        }
      )
      .subscribe();

    channelsRef.current.set(jobId, channel);
    void userId; // userId may be used for future filtering
  }

  async function ensureConversation(firstMessage: string): Promise<string> {
    if (conversationId) return conversationId;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "…" : "");
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, agent_key: "alex", title })
      .select()
      .single();
    if (error || !data) throw new Error("Failed to create conversation");
    setConversationId(data.id);
    router.replace(`/chat/alex?cid=${data.id}`);
    return data.id;
  }

  // ── Send message ────────────────────────────────────────────────────────────

  async function sendMessage(content: string) {
    if (!content.trim() || isLoading) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const cid = await ensureConversation(content);

    // Optimistic user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      agent_key: "alex",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Save user message to DB (this is what checkDailyLimit counts)
    await supabase.from("messages").insert({
      conversation_id: cid,
      user_id: user.id,
      agent_key: "alex",
      role: "user",
      content,
    });

    setIsLoading(true);
    setSynthesis(null);

    // Start the Inngest background job
    try {
      const res = await fetch("/api/alex/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId: cid }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.error ?? "Failed to start — please try again.",
            agent_key: "alex",
            created_at: new Date().toISOString(),
          },
        ]);
        setIsLoading(false);
        return;
      }

      const { jobId } = data as { jobId: string };

      // Add a live job placeholder
      const newJob: AlexJob = {
        id: jobId,
        status: "queued",
        prompt: content,
        steps: [],
        result: null,
        error: null,
      };
      setActiveJobs((prev) => new Map(prev).set(jobId, newJob));

      // Subscribe to Realtime updates for this job row
      subscribeToJob(jobId, user.id);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
          agent_key: "alex",
          created_at: new Date().toISOString(),
        },
      ]);
      setIsLoading(false);
    }
  }

  async function retryJob(job: AlexJob) {
    // Remove the failed job placeholder and resend the original message
    setActiveJobs((prev) => {
      const next = new Map(prev);
      next.delete(job.id);
      return next;
    });
    await sendMessage(job.prompt);
  }

  // ── SynthesisCard handlers (kept intact — not touched in this refactor) ─────
  async function handleConfirmSend() {
    if (!synthesis) return;
    const res = await fetch("/api/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: `Team Brief: ${synthesis.taskSummary}`,
        body: synthesis.content,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? `Email send failed (${res.status})`);
    }
  }

  function handleCancelSend() {
    setSynthesis(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const hasActivity = messages.length > 0 || activeJobs.size > 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-black">
      <AgentHeader agentKey="alex" />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {!hasActivity && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border border-white mx-auto mb-3 flex items-center justify-center text-white font-bold bg-black">
                {alex.initials}
              </div>
              <p className="text-white font-bold text-sm">Alex</p>
              <p className="text-white/40 text-xs mt-1" style={{ fontFamily: "var(--font-space-mono), monospace" }}>Chief of Staff</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} currentAgentKey="alex" />
        ))}

        {/* Live job progress bubbles — one per active job */}
        {Array.from(activeJobs.values()).map((job) => (
          <JobProgressBubble
            key={job.id}
            job={job}
            onRetry={() => retryJob(job)}
          />
        ))}

        {isLoading && activeJobs.size === 0 && (
          <TypingIndicator agentKey="alex" />
        )}

        {synthesis && (
          <SynthesisCard
            content={synthesis.content}
            taskSummary={synthesis.taskSummary}
            userEmail={userEmail}
            onConfirmSend={handleConfirmSend}
            onCancel={handleCancelSend}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={sendMessage} isLoading={isLoading} agentKey="alex" />
    </div>
  );
}
