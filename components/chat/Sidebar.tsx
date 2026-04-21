"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { AGENTS } from "@/lib/agents";
import { createClient } from "@/lib/supabase/client";
import NewTaskModal from "@/components/chat/NewTaskModal";

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  agent_key: string;
}

export default function Sidebar({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showNewTask, setShowNewTask] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  const currentAgent = pathname.split("/")[2] || "alex";

  useEffect(() => {
    loadConversations();
    loadPendingTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPendingTasks() {
    const { count } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .in("status", ["running", "awaiting_confirmation"]);
    setPendingTaskCount(count ?? 0);
  }

  async function loadConversations() {
    const { data } = await supabase
      .from("conversations")
      .select("id, title, created_at, updated_at, agent_key")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (data) setConversations(data);
  }

  async function newConversation(agentKey: string) {
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        agent_key: agentKey,
        title: null,
      })
      .select()
      .single();

    if (!error && data) {
      setConversations((prev) => [data, ...prev]);
      router.push(`/chat/${agentKey}?cid=${data.id}`);
      onClose();
    }
  }

  function getConversationsForAgent(agentKey: string) {
    return conversations.filter((c) => c.agent_key === agentKey);
  }

  function formatTime(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: "short" });
    } else {
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div
      className="h-full flex flex-col dark-scrollbar"
      style={{ background: "#1C1C1E" }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-apple-md bg-white/10 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-semibold text-sm">L</span>
        </div>
        <div>
          <div className="text-white font-semibold text-sm tracking-tight leading-none">
            LineSkip
          </div>
          <div className="text-white/40 text-xs mt-0.5">Virtual Team</div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-white/8 mb-2" />

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto dark-scrollbar px-2 space-y-0.5">
        {AGENTS.map((agent) => {
          const isActive = currentAgent === agent.key;
          const isExpanded = expandedAgent === agent.key;
          const agentConvos = getConversationsForAgent(agent.key);

          return (
            <div key={agent.key}>
              {/* Agent row */}
              <div
                className={`
                  flex items-center gap-2.5 px-2 py-2 rounded-apple-md cursor-pointer
                  transition-colors duration-200 group
                  ${isActive ? "bg-white/12" : "hover:bg-white/6"}
                `}
              >
                {/* Avatar */}
                <Link
                  href={`/chat/${agent.key}`}
                  className="flex items-center gap-2.5 flex-1 min-w-0"
                  onClick={onClose}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold"
                    style={{ background: agent.accent }}
                  >
                    {agent.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white text-sm font-medium leading-none truncate">
                      {agent.name}
                    </div>
                    <div className="text-white/40 text-xs mt-0.5 truncate">{agent.role}</div>
                  </div>
                </Link>

                {/* New chat button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    newConversation(agent.key);
                  }}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
                  title="New conversation"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Expand toggle */}
                {agentConvos.length > 0 && (
                  <button
                    onClick={() => setExpandedAgent(isExpanded ? null : agent.key)}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-white transition-all flex-shrink-0"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="currentColor"
                      className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Conversation list */}
              {isExpanded && agentConvos.length > 0 && (
                <div className="ml-6 mt-0.5 space-y-0.5 mb-1">
                  {agentConvos.map((convo) => {
                    const url = `/chat/${agent.key}?cid=${convo.id}`;
                    const isActiveConvo = pathname + window.location.search === url ||
                      (typeof window !== "undefined" && window.location.search.includes(convo.id));
                    return (
                      <Link
                        key={convo.id}
                        href={url}
                        onClick={onClose}
                        className={`
                          flex items-center justify-between px-2 py-1.5 rounded-apple-md
                          transition-colors duration-200
                          ${isActiveConvo ? "bg-white/10" : "hover:bg-white/6"}
                        `}
                      >
                        <span className="text-white/60 text-xs truncate flex-1 min-w-0">
                          {convo.title || "New conversation"}
                        </span>
                        <span className="text-white/30 text-xs flex-shrink-0 ml-2">
                          {formatTime(convo.updated_at)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Tasks section */}
        <div className="mt-2">
          <div className="mx-2 border-t border-white/8 mb-2" />

          {/* New Task button */}
          <button
            onClick={() => setShowNewTask(true)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-apple-md hover:bg-white/6 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v10M1 6h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.8" />
              </svg>
            </div>
            <span className="text-white/70 text-sm">New Task</span>
          </button>

          {/* Task history link */}
          <Link
            href="/chat/tasks"
            onClick={onClose}
            className={`flex items-center justify-between gap-2.5 px-2 py-2 rounded-apple-md hover:bg-white/6 transition-colors ${currentAgent === "tasks" ? "bg-white/12" : ""}`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="2" width="10" height="10" rx="2" stroke="white" strokeWidth="1.3" strokeOpacity="0.6" />
                  <path d="M4.5 7l2 2L9.5 5" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" />
                </svg>
              </div>
              <span className="text-white/60 text-sm">Tasks</span>
            </div>
            {pendingTaskCount > 0 && (
              <span className="bg-blue-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {pendingTaskCount}
              </span>
            )}
          </Link>
        </div>

        {/* Boardroom */}
        <div className="mt-1">
          <div className="mx-2 border-t border-white/8 mb-2" />
          <Link
            href="/chat/boardroom"
            onClick={onClose}
            className={`
              flex items-center gap-2.5 px-2 py-2 rounded-apple-md
              transition-colors duration-200
              ${currentAgent === "boardroom" ? "bg-white/12" : "hover:bg-white/6"}
            `}
          >
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="5" cy="5" r="2.5" stroke="white" strokeWidth="1.3" strokeOpacity="0.7" />
                <circle cx="9.5" cy="5" r="2.5" stroke="white" strokeWidth="1.3" strokeOpacity="0.7" />
                <path d="M1 12c0-2.2 1.8-4 4-4M8.5 12c0-2.2 1.8-4 4-4" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.7" />
              </svg>
            </div>
            <div>
              <div className="text-white text-sm font-medium leading-none">Boardroom</div>
              <div className="text-white/40 text-xs mt-0.5">All agents</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Bottom — Settings + Sign out */}
      <div className="px-2 pb-4 pt-2 border-t border-white/8 mt-2 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-2.5 px-2 py-2 rounded-apple-md hover:bg-white/6 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="2" stroke="white" strokeWidth="1.3" strokeOpacity="0.6" />
              <path d="M7 1.5v1M7 11.5v1M1.5 7h1M11.5 7h1M3.11 3.11l.71.71M10.18 10.18l.71.71M10.18 3.82l-.71.71M3.82 10.18l-.71.71" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.6" />
            </svg>
          </div>
          <span className="text-white/60 text-sm">Settings</span>
        </Link>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-apple-md hover:bg-white/6 transition-colors text-left"
        >
          <div className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2M10 10l3-3-3-3M13 7H5" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" />
            </svg>
          </div>
          <span className="text-white/60 text-sm">Sign out</span>
        </button>
      </div>
      {showNewTask && <NewTaskModal onClose={() => { setShowNewTask(false); loadPendingTasks(); }} />}
    </div>
  );
}
