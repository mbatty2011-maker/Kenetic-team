"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { AGENTS } from "@/lib/agents";

interface Task {
  id: string;
  agent_key: string;
  title: string;
  status: string;
  steps: TaskStep[];
  result: string | null;
  error: string | null;
  pending_ssh: { command: string; reason: string } | null;
  created_at: string;
  updated_at: string;
}

interface TaskStep {
  type: string;
  label: string;
  text?: string;
  tool?: string;
  command?: string;
  timestamp: string;
}

const STATUS_COLORS: Record<string, string> = {
  running:               "bg-blue-100 text-blue-700",
  awaiting_confirmation: "bg-amber-100 text-amber-700",
  done:                  "bg-green-100 text-green-700",
  failed:                "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  running:               "Running",
  awaiting_confirmation: "Awaiting Confirmation",
  done:                  "Done",
  failed:                "Failed",
};

const TOOL_ICONS: Record<string, string> = {
  web_search: "🔍", create_spreadsheet: "📊", read_spreadsheet: "📊",
  create_document: "📄", send_email: "📧", draft_email: "📧",
  append_to_knowledge_base: "💾", run_ssh_command: "🖥️",
  execute_code: "⚙️",
};

export default function TasksClient() {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [confirmingTask, setConfirmingTask] = useState<string | null>(null);
  const [cancellingTask, setCancellingTask] = useState<string | null>(null);
  const [retryingTask, setRetryingTask] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadTasks();
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadTasks() {
    if (!userId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc("get_user_tasks", { p_user_id: userId });
    if (data) {
      setTasks(data as Task[]);
      if (selected) {
        const updated = data.find((t: Task) => t.id === selected.id);
        if (updated) setSelected(updated as Task);
      }
    }
  }

  async function confirmSSH(taskId: string, confirmed: boolean) {
    setConfirmingTask(taskId);
    setResumeStatus(confirmed ? "Connecting to Pi..." : "Cancelling...");

    try {
      const res = await fetch(`/api/task/${taskId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });

      if (res.ok && res.body) {
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
              const event = JSON.parse(line.slice(6));
              if (event.type === "complete" || event.type === "done") setResumeStatus("Task complete!");
              if (event.type === "error") setResumeStatus("Error: " + event.message);
            } catch {}
          }
        }

        await loadTasks();
      }
    } catch (err) {
      setResumeStatus("Resume failed: " + (err instanceof Error ? err.message : String(err)));
    }

    setConfirmingTask(null);
    setTimeout(() => setResumeStatus(""), 3000);
  }

  async function cancelTask(taskId: string) {
    setCancellingTask(taskId);
    try {
      await fetch(`/api/task/${taskId}/cancel`, { method: "POST" });
      await loadTasks();
    } catch {}
    setCancellingTask(null);
  }

  async function retryTask(task: Task) {
    setRetryingTask(task.id);
    try {
      await fetch("/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey: task.agent_key, taskDescription: task.title }),
      });
      await loadTasks();
    } catch {}
    setRetryingTask(null);
  }

  function exportTask(task: Task) {
    const agent = AGENTS.find((a) => a.key === task.agent_key);
    const date = new Date(task.created_at).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
    const content = [
      `# ${task.title}`,
      `**Agent:** ${agent?.name ?? task.agent_key} — ${agent?.role ?? ""}`,
      `**Date:** ${date}`,
      `**Status:** ${STATUS_LABELS[task.status] ?? task.status}`,
      "",
      "---",
      "",
      task.result ?? "(No result)",
    ].join("\n");

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-${task.title.slice(0, 40).replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatTime(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="flex h-full min-h-0 bg-apple-gray-50">
      {/* Task list */}
      <div className="w-72 border-r border-apple-gray-100 bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-apple-gray-100">
          <h1 className="text-apple-gray-950 font-semibold text-base">Task History</h1>
          <p className="text-apple-gray-500 text-xs mt-0.5">{tasks.length} tasks</p>
        </div>

        <div className="flex-1 overflow-y-auto dark-scrollbar">
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <div className="w-10 h-10 rounded-full bg-apple-gray-100 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="3" y="3" width="12" height="12" rx="2.5" stroke="#8E8E93" strokeWidth="1.3" />
                  <path d="M6 9l2.5 2.5L12 6.5" stroke="#8E8E93" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-apple-gray-400 text-sm">No tasks yet</p>
              <p className="text-apple-gray-300 text-xs">Assign a task from the sidebar</p>
            </div>
          )}
          {tasks.map((task) => {
            const agent = AGENTS.find((a) => a.key === task.agent_key);
            return (
              <button
                key={task.id}
                onClick={() => setSelected(task)}
                className={`w-full text-left px-4 py-3 border-b border-apple-gray-50 hover:bg-apple-gray-50 transition-colors ${
                  selected?.id === task.id ? "bg-apple-gray-50" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                    style={{ background: agent?.accent ?? "#48484A" }}
                  >
                    {agent?.initials}
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[task.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>
                  <span className="text-[10px] text-apple-gray-400 ml-auto">{formatTime(task.created_at)}</span>
                </div>
                <p className="text-xs text-apple-gray-700 truncate font-medium">{task.title}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Task detail */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <div className="w-12 h-12 rounded-full bg-apple-gray-100 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="3" width="16" height="16" rx="3" stroke="#C7C7CC" strokeWidth="1.5" />
                <path d="M7.5 11l3 3 4-5" stroke="#C7C7CC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-apple-gray-600 text-sm font-medium">Select a task</p>
              <p className="text-apple-gray-400 text-xs mt-0.5">Choose a task from the list to view its progress</p>
            </div>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="px-6 py-4 border-b border-apple-gray-100 bg-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {(() => {
                    const agent = AGENTS.find((a) => a.key === selected.agent_key);
                    return (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                        style={{ background: agent?.accent }}
                      >
                        {agent?.initials}
                      </div>
                    );
                  })()}
                  <div className="min-w-0">
                    <h2 className="text-apple-gray-950 font-semibold text-sm truncate">{selected.title}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[selected.status] ?? ""}`}>
                        {STATUS_LABELS[selected.status] ?? selected.status}
                      </span>
                      <span className="text-[10px] text-apple-gray-400">{formatTime(selected.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selected.status === "done" && selected.result && (
                    <button
                      onClick={() => exportTask(selected)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-apple-gray-600 bg-apple-gray-50 border border-apple-gray-200 rounded-apple-md hover:bg-apple-gray-100 transition-colors"
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M5.5 1v6M2.5 5l3 3 3-3M1 9.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Export
                    </button>
                  )}
                  {selected.status === "running" && (
                    <button
                      onClick={() => cancelTask(selected.id)}
                      disabled={cancellingTask === selected.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-apple-md hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      {cancellingTask === selected.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                  {selected.status === "failed" && (
                    <button
                      onClick={() => retryTask(selected)}
                      disabled={retryingTask === selected.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-apple-gray-700 bg-apple-gray-50 border border-apple-gray-200 rounded-apple-md hover:bg-apple-gray-100 disabled:opacity-50 transition-colors"
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M1.5 5.5A4 4 0 109 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        <path d="M7 1l2 1.5-1.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {retryingTask === selected.id ? "Retrying..." : "Retry"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 dark-scrollbar">
              {/* SSH Confirmation card */}
              {selected.status === "awaiting_confirmation" && selected.pending_ssh && (
                <div className="border border-amber-200 bg-amber-50 rounded-apple-xl p-5 space-y-3">
                  <p className="text-sm font-semibold text-amber-900">⚠️ SSH Command — Confirmation Required</p>
                  {selected.pending_ssh.reason && (
                    <p className="text-xs text-amber-700">{selected.pending_ssh.reason}</p>
                  )}
                  <pre className="text-xs font-mono bg-white border border-amber-200 rounded-apple-md px-3 py-2 text-apple-gray-950 overflow-x-auto">
                    {selected.pending_ssh.command}
                  </pre>
                  {resumeStatus && <p className="text-xs text-apple-gray-500">{resumeStatus}</p>}
                  <div className="flex gap-3">
                    <button
                      disabled={confirmingTask === selected.id}
                      onClick={() => confirmSSH(selected.id, true)}
                      className="flex-1 py-2.5 rounded-apple-lg bg-apple-gray-950 text-white text-sm font-semibold hover:bg-apple-gray-800 disabled:opacity-50 transition-colors"
                    >
                      {confirmingTask === selected.id ? "Running..." : "Confirm Execute on Pi"}
                    </button>
                    <button
                      disabled={confirmingTask === selected.id}
                      onClick={() => confirmSSH(selected.id, false)}
                      className="flex-1 py-2.5 rounded-apple-lg bg-apple-gray-100 text-apple-gray-700 text-sm font-semibold hover:bg-apple-gray-200 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Steps */}
              {(selected.steps ?? []).map((step, i) => (
                <div key={i}>
                  {step.type === "thinking" ? (
                    <p className="text-xs text-apple-gray-400 italic">⏳ Thinking...</p>
                  ) : step.type === "reasoning" && step.text ? (
                    <div className="bg-white border border-apple-gray-100 rounded-apple-lg px-4 py-3">
                      <p className="text-xs text-apple-gray-700 leading-relaxed whitespace-pre-wrap">{step.text}</p>
                    </div>
                  ) : step.type === "tool_call" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{TOOL_ICONS[step.tool ?? ""] ?? "⚡"}</span>
                      <span className="text-xs font-medium text-apple-gray-600">{step.label}</span>
                    </div>
                  ) : step.type === "tool_result" && step.text ? (
                    <div className="ml-4 bg-apple-gray-50 border border-apple-gray-100 rounded-apple-md px-3 py-2">
                      <p className="text-[11px] text-apple-gray-500 whitespace-pre-wrap">{step.text}</p>
                    </div>
                  ) : step.type === "done" ? (
                    <div className="bg-green-50 border border-green-200 rounded-apple-xl px-4 py-4">
                      <p className="text-xs font-semibold text-green-800 mb-2">🎉 Task Complete</p>
                      <p className="text-sm text-green-700 whitespace-pre-wrap leading-relaxed">{step.text}</p>
                    </div>
                  ) : step.type === "confirm_required" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs">⚠️</span>
                      <span className="text-xs font-medium text-amber-700">Paused — waiting for SSH confirmation</span>
                    </div>
                  ) : null}
                </div>
              ))}

              {/* Running indicator */}
              {selected.status === "running" && (
                <div className="flex items-center gap-2 py-1">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-blue-500 animate-spin flex-shrink-0" style={{ animationDuration: "1.5s" }}>
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" />
                  </svg>
                  <span className="text-xs text-apple-gray-400">Working... (auto-refreshes every 5s)</span>
                </div>
              )}

              {/* Error */}
              {selected.status === "failed" && selected.error && (
                <div className="bg-red-50 border border-red-200 rounded-apple-lg px-4 py-3">
                  <p className="text-xs font-semibold text-red-800 mb-1">Task Failed</p>
                  <p className="text-xs text-red-700">{selected.error}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
