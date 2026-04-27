"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AGENTS, type AgentKey } from "@/lib/agents";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ChatInput from "./ChatInput";
import AgentHeader from "./AgentHeader";
import UpgradePrompt from "@/components/UpgradePrompt";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent_key?: string;
  created_at: string;
  isStreaming?: boolean;
}

export default function ChatWindow({ agentKey }: { agentKey: AgentKey | "boardroom" }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<{
    reason: string;
    limitHit: string;
    tier: string;
  } | null>(null);
  const isNewConvoRef = useRef(false);
  const autostartRef = useRef(false);

  const agent = agentKey !== "boardroom" ? AGENTS.find((a) => a.key === agentKey) : null;
  const isBoardroom = agentKey === "boardroom";

  useEffect(() => {
    const cid = searchParams.get("cid");
    if (cid) {
      setConversationId(cid);
      loadMessages(cid);
    } else {
      setMessages([]);
      setConversationId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, agentKey]);

  async function loadMessages(cid: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true });
    if (!data || searchParams.get("cid") !== cid) return;
    setMessages(data as Message[]);

    const autostart = searchParams.get("autostart") === "1";
    if (!autostart || autostartRef.current || isBoardroom) return;
    const msgs = data as Message[];
    const userMsgs = msgs.filter((m) => m.role === "user");
    const asstMsgs = msgs.filter((m) => m.role === "assistant");
    if (userMsgs.length === 0 || asstMsgs.length > 0) return;
    autostartRef.current = true;
    const lastMsg = userMsgs[userMsgs.length - 1];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    isNewConvoRef.current = true;
    setIsLoading(true);
    await handleAgentMessage(lastMsg.content, cid, user.id);
    setIsLoading(false);
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function ensureConversation(firstMessage: string): Promise<string> {
    if (conversationId) return conversationId;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "..." : "");
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, agent_key: agentKey, title })
      .select()
      .single();

    if (error || !data) throw new Error("Failed to create conversation");

    setConversationId(data.id);
    router.replace(`/chat/${agentKey}?cid=${data.id}`);
    return data.id;
  }

  async function sendMessage(content: string) {
    if (!content.trim() || isLoading) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    isNewConvoRef.current = !conversationId;
    const cid = await ensureConversation(content);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      agent_key: agentKey,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    await supabase.from("messages").insert({
      conversation_id: cid,
      user_id: user.id,
      agent_key: agentKey,
      role: "user",
      content,
    });

    setIsLoading(true);

    if (isBoardroom) {
      await handleBoardroomMessage(content, cid, user.id);
    } else {
      await handleAgentMessage(content, cid, user.id);
    }

    setIsLoading(false);
  }

  async function handleAgentMessage(content: string, cid: string, uid: string) {
    const streamingId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: streamingId,
        role: "assistant",
        content: "",
        agent_key: agentKey,
        created_at: new Date().toISOString(),
        isStreaming: true,
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey, message: content, conversationId: cid }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        if (detail?.error === "limit_reached") {
          setMessages((prev) => prev.filter((m) => m.id !== streamingId));
          setUpgradePrompt({
            reason: `Monthly ${agent?.name ?? agentKey} message limit reached`,
            limitHit: `${detail.current} of ${detail.limit} messages used this month`,
            tier: detail.tier,
          });
          return;
        }
        throw new Error(detail?.error ?? `API error ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "searching") {
              setIsSearching(true);
            } else if (parsed.type === "tool_running") {
              setIsSearching(false);
              setToolStatus(parsed.label ?? parsed.tool ?? "Working...");
            } else if (parsed.text) {
              setIsSearching(false);
              setToolStatus(null);
              fullContent += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, content: fullContent, isStreaming: true }
                    : m
                )
              );
            } else if (parsed.error) {
              setIsSearching(false);
              setToolStatus(null);
              fullContent = `Something went wrong: ${parsed.error}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId
                    ? { ...m, content: fullContent, isStreaming: false }
                    : m
                )
              );
            }
          } catch {}
        }
      }

      setIsSearching(false);
      setToolStatus(null);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, isStreaming: false } : m
        )
      );

      if (fullContent) {
        await supabase.from("messages").insert({
          conversation_id: cid,
          user_id: uid,
          agent_key: agentKey,
          role: "assistant",
          content: fullContent,
        });
      }

      if (isNewConvoRef.current) {
        isNewConvoRef.current = false;
        fetch(`/api/conversation/${cid}/title`, { method: "POST" }).catch(() => {});
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", cid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[chat] handleAgentMessage failed:", msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? { ...m, content: `Something went wrong: ${msg}`, isStreaming: false }
            : m
        )
      );
    }
  }

  async function handleBoardroomMessage(content: string, cid: string, uid: string) {
    void uid; // DB saves are handled server-side in the boardroom route
    try {
      const res = await fetch("/api/boardroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId: cid }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        if (detail?.error === "limit_reached") {
          setUpgradePrompt({
            reason: "Monthly Boardroom session limit reached",
            limitHit: `${detail.current} of ${detail.limit} sessions used this month`,
            tier: detail.tier,
          });
          return;
        }
        throw new Error(detail?.error ?? `API error ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      // Stream SSE — each agent's response appears the instant it finishes
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      setToolStatus("Consulting the team…");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const rawData = line.slice(6).trim();

          // Parse JSON separately so malformed chunks are skipped without
          // catching real errors thrown below in the switch.
          let parsed: {
            type: string;
            message?: string;
            agentKey?: string;
            content?: string;
            tier?: string;
            limit?: number;
            current?: number;
          } | null = null;
          try { parsed = JSON.parse(rawData); } catch { continue; }
          if (!parsed) continue;

          switch (parsed.type) {
            case "status":
              setToolStatus(parsed.message ?? null);
              break;

            case "agent_response":
              setToolStatus(null);
              if (parsed.content?.trim()) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant" as const,
                    content: parsed.content!,
                    agent_key: parsed.agentKey,
                    created_at: new Date().toISOString(),
                  },
                ]);
              }
              break;

            case "synthesizing":
              setToolStatus("Alex synthesising…");
              break;

            case "synthesis":
              setToolStatus(null);
              if (parsed.content?.trim()) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant" as const,
                    content: parsed.content!,
                    agent_key: parsed.agentKey ?? "alex",
                    created_at: new Date().toISOString(),
                  },
                ]);
              }
              break;

            case "limit_reached":
              setUpgradePrompt({
                reason: "Monthly Boardroom session limit reached",
                limitHit: `${parsed.current} of ${parsed.limit} sessions used this month`,
                tier: parsed.tier ?? "free",
              });
              break;

            case "error":
              throw new Error(parsed.message ?? "Boardroom error");

            case "done":
              break;
          }
        }
      }

      setToolStatus(null);
    } catch (err) {
      setToolStatus(null);
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[boardroom] stream error:", msg);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: "Something went wrong. Please try again.",
          agent_key: "boardroom",
          created_at: new Date().toISOString(),
        },
      ]);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-black">
      <AgentHeader agentKey={agentKey} />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border border-white mx-auto mb-3 flex items-center justify-center text-white font-bold">
                {isBoardroom ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="7" cy="7" r="3.5" stroke="white" strokeWidth="1.5" />
                    <circle cx="13.5" cy="7" r="3.5" stroke="white" strokeWidth="1.5" />
                    <path d="M1 17c0-3 2.5-5.5 6-5.5M13.5 17c0-3 2.5-5.5 6-5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  agent?.initials
                )}
              </div>
              <p className="text-white font-bold text-sm">
                {isBoardroom ? "Boardroom" : agent?.name}
              </p>
              <p
                className="text-white/40 text-xs mt-1"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                {isBoardroom ? "Message all agents" : `Message ${agent?.name}`}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} currentAgentKey={agentKey} />
        ))}

        {(isSearching || toolStatus) && (
          <div className="flex items-center gap-2 animate-fade-in">
            <div className="w-7 h-7 border border-white flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-black">
              {agent?.initials ?? "?"}
            </div>
            <div
              className="flex items-center gap-2 px-4 py-2.5 bg-black border border-white"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white animate-spin" style={{ animationDuration: "1.5s" }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" />
              </svg>
              <span
                className="text-xs text-white/60"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                {toolStatus ?? "Searching the web..."}
              </span>
            </div>
          </div>
        )}
        {isLoading && !isSearching && !toolStatus && !messages.some((m) => m.isStreaming && m.content.length > 0) && (
          <TypingIndicator agentKey={agentKey} />
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={sendMessage} isLoading={isLoading} agentKey={agentKey} />

      {upgradePrompt && (
        <UpgradePrompt
          reason={upgradePrompt.reason}
          limitHit={upgradePrompt.limitHit}
          tier={upgradePrompt.tier}
          onDismiss={() => setUpgradePrompt(null)}
        />
      )}
    </div>
  );
}
