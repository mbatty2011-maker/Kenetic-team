"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AGENTS, type AgentKey } from "@/lib/agents";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ChatInput from "./ChatInput";
import AgentHeader from "./AgentHeader";

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
  const [conversationId, setConversationId] = useState<string | null>(null);

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
    if (data) setMessages(data as Message[]);
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

    const cid = await ensureConversation(content);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      agent_key: agentKey,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Save user message to Supabase
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

      if (!res.ok) throw new Error("API error");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullContent += parsed.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingId
                      ? { ...m, content: fullContent, isStreaming: true }
                      : m
                  )
                );
              }
            } catch {}
          }
        }
      }

      // Mark streaming done
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, isStreaming: false } : m
        )
      );

      // Save assistant message
      await supabase.from("messages").insert({
        conversation_id: cid,
        user_id: uid,
        agent_key: agentKey,
        role: "assistant",
        content: fullContent,
      });

      // Update conversation updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", cid);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? { ...m, content: "Something went wrong. Please try again.", isStreaming: false }
            : m
        )
      );
    }
  }

  async function handleBoardroomMessage(content: string, cid: string, uid: string) {
    try {
      const res = await fetch("/api/boardroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId: cid }),
      });

      if (!res.ok) throw new Error("API error");
      const { responses } = await res.json();

      for (const resp of responses) {
        if (!resp.content?.trim()) continue;
        const msg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: resp.content,
          agent_key: resp.agentKey,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, msg]);
        await supabase.from("messages").insert({
          conversation_id: cid,
          user_id: uid,
          agent_key: resp.agentKey,
          role: "assistant",
          content: resp.content,
        });
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", cid);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
          agent_key: "boardroom",
          created_at: new Date().toISOString(),
        },
      ]);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white md:bg-apple-gray-50">
      {/* Header */}
      <AgentHeader agentKey={agentKey} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div
                className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-white font-semibold"
                style={{
                  background: isBoardroom ? "#48484A" : agent?.accent,
                }}
              >
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
              <p className="text-apple-gray-950 font-medium text-sm">
                {isBoardroom ? "Boardroom" : agent?.name}
              </p>
              <p className="text-apple-gray-500 text-xs mt-1">
                {isBoardroom ? "Message all agents" : `Message ${agent?.name}`}
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} currentAgentKey={agentKey} />
        ))}

        {isLoading && !messages.some((m) => m.isStreaming) && (
          <TypingIndicator agentKey={agentKey} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={sendMessage} isLoading={isLoading} agentKey={agentKey} />
    </div>
  );
}
