"use client";

import { useState, useRef, useEffect } from "react";
import { AGENTS } from "@/lib/agents";
import type { AgentKey } from "@/lib/agents";
import MarkdownContent from "./MarkdownContent";

interface TaskStep {
  type: string;
  label: string;
  text?: string;
  tool?: string;
  timestamp: string;
}


const TOOL_ICONS: Record<string, string> = {
  web_search:               "🔍",
  create_spreadsheet:       "📊",
  read_spreadsheet:         "📊",
  create_document:          "📄",
  send_email:               "📧",
  draft_email:              "📧",
  append_to_knowledge_base: "💾",
  execute_code:             "⚙️",
  github_search_repos:      "🐙",
  github_get_repo:          "🐙",
  github_read_file:         "🐙",
  github_list_directory:    "🐙",
  github_search_code:       "🐙",
  github_list_commits:      "🐙",
  github_list_issues:       "🐙",
  github_get_issue:         "🐙",
  github_list_pulls:        "🐙",
  github_get_pull:          "🐙",
};

export default function NewTaskModal({ onClose }: { onClose: () => void }) {
  const [selectedAgent, setSelectedAgent] = useState<AgentKey>("alex");
  const [taskDescription, setTaskDescription] = useState("");
  const [phase, setPhase] = useState<"form" | "running" | "done" | "error">("form");
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const stepsEndRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readerRef.current?.cancel();
    };
  }, []);

  async function runTask() {
    if (!taskDescription.trim()) return;
    setPhase("running");
    setSteps([]);
    setErrorMsg("");

    try {
      const res = await fetch("/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey: selectedAgent, taskDescription }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Server error ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");
      await consumeStream(res.body.getReader());
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setPhase("error");
    }
  }

  async function consumeStream(reader: ReadableStreamDefaultReader) {
    readerRef.current = reader;
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
          handleEvent(event);
        } catch {}
      }
    }
  }

  function handleEvent(event: Record<string, unknown>) {
    if (!mountedRef.current) return;
    if (event.type === "step") {
      setSteps((prev) => [...prev, event.data as TaskStep]);
    } else if (event.type === "complete") {
      setPhase("done");
    } else if (event.type === "error") {
      setErrorMsg(event.message as string);
      setPhase("error");
    }
  }

  const agent = AGENTS.find((a) => a.key === selectedAgent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-apple-2xl shadow-apple-xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-apple-gray-100">
          <div>
            <h2 className="text-apple-gray-950 font-semibold text-base">
              {phase === "form" ? "Assign a Task" : phase === "running" ? "Running Task..." : phase === "done" ? "Task Complete" : "Task Failed"}
            </h2>
            {phase !== "form" && (
              <p className="text-apple-gray-500 text-xs mt-0.5 truncate max-w-xs">{taskDescription}</p>
            )}
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

        {/* Form */}
        {phase === "form" && (
          <div className="p-5 space-y-4">
            {/* Agent selector */}
            <div>
              <label className="block text-xs font-medium text-apple-gray-500 mb-2">Assign to</label>
              <div className="grid grid-cols-5 gap-2">
                {AGENTS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setSelectedAgent(a.key)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-apple-lg border transition-all ${
                      selectedAgent === a.key
                        ? "border-2 border-opacity-100 bg-opacity-10"
                        : "border border-apple-gray-200 hover:border-apple-gray-300"
                    }`}
                    style={selectedAgent === a.key ? { borderColor: a.accent, background: a.accent + "15" } : {}}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                      style={{ background: a.accent }}
                    >
                      {a.initials}
                    </div>
                    <span className="text-xs text-apple-gray-700 font-medium leading-none">{a.name}</span>
                    <span className="text-[10px] text-apple-gray-400 leading-none">{a.role.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Task input */}
            <div>
              <label className="block text-xs font-medium text-apple-gray-500 mb-2">Task description</label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder={`e.g. "Research our top competitor and draft a comparison report"`}
                className="w-full px-3 py-3 bg-apple-gray-50 border border-apple-gray-200 rounded-apple-lg text-sm text-apple-gray-950 placeholder-apple-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-apple-gray-300 transition-all"
                rows={4}
                onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) runTask(); }}
              />
              <p className="text-[11px] text-apple-gray-400 mt-1">⌘ Enter to run</p>
            </div>

            <button
              onClick={runTask}
              disabled={!taskDescription.trim() || phase !== "form"}
              className="w-full py-2.5 rounded-apple-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: agent?.accent ?? "#1C1C1E" }}
            >
              Run Task with {agent?.name}
            </button>
          </div>
        )}

        {/* Step feed */}
        {(phase === "running" || phase === "done" || phase === "error") && (
          <div className="flex-1 overflow-y-auto p-5 space-y-2 dark-scrollbar" style={{ background: "#FAFAFA" }}>
            {steps.map((step, i) => (
              <StepRow key={i} step={step} />
            ))}

            {phase === "running" && (
              <div className="flex items-center gap-2 py-1">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-apple-gray-400 animate-spin flex-shrink-0" style={{ animationDuration: "1.5s" }}>
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" />
                </svg>
                <span className="text-xs text-apple-gray-400">Working...</span>
              </div>
            )}

            {phase === "error" && (
              <div className="bg-red-50 border border-red-200 rounded-apple-lg px-4 py-3">
                <p className="text-sm text-red-700">{errorMsg}</p>
              </div>
            )}

            <div ref={stepsEndRef} />
          </div>
        )}

        {/* Done footer */}
        {phase === "done" && (
          <div className="px-5 py-3 border-t border-apple-gray-100">
            <button
              onClick={onClose}
              className="w-full py-2 rounded-apple-lg bg-apple-gray-950 text-white text-sm font-semibold hover:bg-apple-gray-800 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: TaskStep }) {
  if (step.type === "thinking") {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-xs text-apple-gray-400">⏳</span>
        <span className="text-xs text-apple-gray-400 italic">Thinking...</span>
      </div>
    );
  }

  if (step.type === "reasoning" && step.text) {
    return (
      <div className="bg-white border border-apple-gray-100 rounded-apple-lg px-3 py-2.5">
        <p className="text-xs text-apple-gray-700 leading-relaxed line-clamp-4">{step.text}</p>
      </div>
    );
  }

  if (step.type === "tool_call") {
    const icon = TOOL_ICONS[step.tool ?? ""] ?? "⚡";
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-xs">{icon}</span>
        <span className="text-xs font-medium text-apple-gray-600">{step.label}</span>
      </div>
    );
  }

  if (step.type === "tool_result") {
    return (
      <div className="ml-4 bg-apple-gray-50 border border-apple-gray-100 rounded-apple-md px-3 py-2">
        <p className="text-[11px] text-apple-gray-500 line-clamp-2">{step.text}</p>
      </div>
    );
  }

  if (step.type === "done") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-apple-lg px-4 py-3">
        <p className="text-xs font-semibold text-green-800 mb-2">🎉 Task Complete</p>
        <MarkdownContent content={step.text ?? ""} />
      </div>
    );
  }

  return null;
}
