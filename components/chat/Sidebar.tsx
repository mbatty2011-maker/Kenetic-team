"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { User } from "@supabase/supabase-js";
import { AGENTS } from "@/lib/agents";
import { createClient } from "@/lib/supabase/client";
import FeedbackModal from "@/components/chat/FeedbackModal";

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
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const currentAgent = pathname.split("/")[2] || "alex";

  // Auto-expand the active agent's conversation list
  useEffect(() => {
    if (currentAgent && currentAgent !== "tasks" && currentAgent !== "boardroom") {
      setExpandedAgent(currentAgent);
    }
  }, [currentAgent]);

  useEffect(() => {
    loadConversations();

    // Real-time subscription — sidebar refreshes whenever conversations change
    const channel = supabase
      .channel("sidebar-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        loadConversations
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

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
      .insert({ user_id: user.id, agent_key: agentKey, title: null })
      .select()
      .single();
    if (!error && data) {
      router.push(`/chat/${agentKey}?cid=${data.id}`);
      onClose();
    }
  }

  async function deleteConversation(convoId: string, agentKey: string) {
    try {
      await supabase.from("messages").delete().eq("conversation_id", convoId);
      const { error } = await supabase.from("conversations").delete().eq("id", convoId).eq("user_id", user.id);
      if (error) throw error;
      setConversations((prev) => prev.filter((c) => c.id !== convoId));
      if (searchParams.get("cid") === convoId) {
        router.push(`/chat/${agentKey}`);
      }
    } catch {
      // silently ignore — UI stays consistent
    } finally {
      setDeletingId(null);
    }
  }

  async function renameConversation(convoId: string) {
    const trimmed = renameValue.trim();
    if (trimmed) {
      const { error } = await supabase
        .from("conversations")
        .update({ title: trimmed })
        .eq("id", convoId)
        .eq("user_id", user.id);
      if (!error) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convoId ? { ...c, title: trimmed } : c))
        );
      }
    }
    setRenamingId(null);
  }

  function startRename(convo: Conversation) {
    setRenamingId(convo.id);
    setRenameValue(convo.title ?? "");
  }

  function getConversationsForAgent(agentKey: string) {
    return conversations.filter((c) => c.agent_key === agentKey);
  }

  function formatTime(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="h-full flex flex-col dark-scrollbar" style={{ background: "#1C1C1E" }}>
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 flex items-center">
        <Image src="/knetc-logo.png" alt="knetc team" width={96} height={26} className="h-6 w-auto invert" />
      </div>

      <div className="mx-3 border-t border-white/8 mb-2" />

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto dark-scrollbar px-2 space-y-0.5">
        {AGENTS.map((agent) => {
          const isActive = currentAgent === agent.key;
          const isExpanded = expandedAgent === agent.key;
          const agentConvos = getConversationsForAgent(agent.key);

          return (
            <div key={agent.key}>
              <div
                className={`flex items-center gap-2.5 px-2 py-2 rounded-apple-md cursor-pointer transition-colors duration-200 group ${
                  isActive ? "bg-white/12" : "hover:bg-white/6"
                }`}
              >
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
                    <div className="text-white text-sm font-medium leading-none truncate">{agent.name}</div>
                    <div className="text-white/40 text-xs mt-0.5 truncate">{agent.role}</div>
                  </div>
                </Link>

                <button
                  onClick={(e) => { e.stopPropagation(); newConversation(agent.key); }}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
                  title="New conversation"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>

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

              {isExpanded && agentConvos.length > 0 && (
                <div className="ml-6 mt-0.5 space-y-0.5 mb-1">
                  {agentConvos.map((convo) => {
                    const url = `/chat/${agent.key}?cid=${convo.id}`;
                    const isActiveConvo =
                      pathname === `/chat/${agent.key}` && searchParams.get("cid") === convo.id;

                    if (deletingId === convo.id) {
                      return (
                        <div
                          key={convo.id}
                          className="px-2 py-2 rounded-apple-md bg-red-900/20 border border-red-500/20"
                        >
                          <p className="text-white/70 text-xs mb-2">Delete this conversation?</p>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => deleteConversation(convo.id, agent.key)}
                              className="text-[10px] px-2 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="text-[10px] px-2 py-1 bg-white/10 text-white/60 rounded hover:bg-white/20 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (renamingId === convo.id) {
                      return (
                        <div key={convo.id} className="px-2 py-1">
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => renameConversation(convo.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") renameConversation(convo.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            className="w-full text-xs bg-white/10 text-white px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-white/30"
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={convo.id}
                        className={`group/convo flex items-center rounded-apple-md transition-colors duration-200 ${
                          isActiveConvo ? "bg-white/10" : "hover:bg-white/6"
                        }`}
                      >
                        <Link
                          href={url}
                          onClick={onClose}
                          className="flex items-center justify-between flex-1 min-w-0 px-2 py-1.5"
                        >
                          <span className="text-white/60 text-xs truncate flex-1 min-w-0">
                            {convo.title || "New conversation"}
                          </span>
                          <span className="text-white/30 text-xs flex-shrink-0 ml-2 group-hover/convo:hidden">
                            {formatTime(convo.updated_at)}
                          </span>
                        </Link>

                        {/* Action buttons — visible on hover */}
                        <div className="hidden group-hover/convo:flex items-center gap-0.5 pr-1.5 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); startRename(convo); }}
                            title="Rename"
                            className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                              <path d="M1.5 6.5L5.5 2.5l1.5 1.5-4 4H1.5V6.5zM5 3l1.5-1.5L8 3l-1.5 1.5L5 3z" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingId(convo.id); }}
                            title="Delete"
                            className="w-5 h-5 rounded flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors"
                          >
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                              <path d="M1.5 2.5h6M3 2.5V1.5h3v1M2 2.5l.5 5h4l.5-5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Boardroom */}
        <div className="mt-1">
          <div className="mx-2 border-t border-white/8 mb-2" />
          <Link
            href="/chat/boardroom"
            onClick={onClose}
            className={`flex items-center gap-2.5 px-2 py-2 rounded-apple-md transition-colors duration-200 ${
              currentAgent === "boardroom" ? "bg-white/12" : "hover:bg-white/6"
            }`}
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

      {/* Bottom — Settings + Feedback + Sign out */}
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
          onClick={() => setShowFeedback(true)}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-apple-md hover:bg-white/6 transition-colors text-left"
        >
          <div className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h10a1 1 0 011 1v6a1 1 0 01-1 1H8l-3 2v-2H2a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" />
            </svg>
          </div>
          <span className="text-white/60 text-sm">Give Feedback</span>
        </button>

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

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
}
