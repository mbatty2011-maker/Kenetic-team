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
};

export default function TasksClient() {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [confirmingTask, setConfirmingTask] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<string>("");

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTasks() {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setTasks(data as Task[]);
      if (selected) {
        const updated = data.find((t) => t.id === selected.id);
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
            <div className="flex items-center justify-center h-32">
              <p className="text-apple-gray-400 text-sm">No tasks yet</p>
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
          <div className="flex items-center justify-center h-full text-apple-gray-400 text-sm">
            Select a task to view details
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-apple-gray-100 bg-white">
              <div className="flex items-center gap-3 mb-1">
                {(() => {
                  const agent = AGENTS.find((a) => a.key === selected.agent_key);
                  return (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold" style={{ background: agent?.accent }}>
                      {agent?.initials}
                    </div>
                  );
                })()}
                <div>
                  <h2 className="text-apple-gray-950 font-semibold text-sm">{selected.title}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[selected.status] ?? ""}`}>
                      {STATUS_LABELS[selected.status] ?? selected.status}
                    </span>
                    <span className="text-[10px] text-apple-gray-400">{formatTime(selected.created_at)}</span>
                  </div>
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
