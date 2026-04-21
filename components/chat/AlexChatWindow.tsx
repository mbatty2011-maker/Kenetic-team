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

export default function AlexChatWindow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // null = normal mode, string = Alex asked clarifying Qs, next reply triggers orchestration
  const [pendingOrchestrationTask, setPendingOrchestrationTask] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisData | null>(null);

  const alex = AGENTS.find((a) => a.key === "alex")!;

  useEffect(() => {
    const cid = searchParams.get("cid");
    if (cid) {
      setConversationId(cid);
      loadMessages(cid);
    } else {
      setMessages([]);
      setConversationId(null);
      setPendingOrchestrationTask(null);
      setSynthesis(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function loadMessages(cid: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ensureConversation(firstMessage: string): Promise<string> {
    if (conversationId) return conversationId;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? "..." : "");
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

  async function saveMessage(cid: string, uid: string, role: string, content: string) {
    await supabase.from("messages").insert({
      conversation_id: cid,
      user_id: uid,
      agent_key: "alex",
      role,
      content,
    });
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
      agent_key: "alex",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    await saveMessage(cid, user.id, "user", content);

    setIsLoading(true);
    setSynthesis(null);

    if (pendingOrchestrationTask) {
      // User has answered Alex's clarifying questions — run full orchestration now
      await runOrchestration(cid, user.id, pendingOrchestrationTask, content);
      setPendingOrchestrationTask(null);
    } else {
      await streamAlexResponse(content, cid, user.id);
    }

    setIsLoading(false);
  }

  async function streamAlexResponse(
    content: string,
    cid: string,
    uid: string,
  ) {
    const streamingId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: streamingId,
        role: "assistant",
        content: "",
        agent_key: "alex",
        created_at: new Date().toISOString(),
        isStreaming: true,
      },
    ]);

    try {
      const res = await fetch("/api/alex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId: cid, mode: "classify" }),
      });

      if (!res.body) throw new Error("No body");

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
            if (parsed.type === "orchestrate_start") {
              // Signal received — next user reply will trigger full orchestration
              setPendingOrchestrationTask(content);
            } else if (parsed.type === "text") {
              fullContent += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId ? { ...m, content: fullContent } : m
                )
              );
            }
          } catch {}
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, isStreaming: false } : m
        )
      );

      if (fullContent) {
        await saveMessage(cid, uid, "assistant", fullContent);
      }

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

  async function runOrchestration(cid: string, uid: string, taskSummary: string, clarification?: string) {

    const statusId = crypto.randomUUID();

    try {
      const res = await fetch("/api/alex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clarification
            ? `${taskSummary}\n\nAdditional context from user: ${clarification}`
            : taskSummary,
          conversationId: cid,
          mode: "orchestrate"
        }),
      });

      if (!res.body) throw new Error("No body");

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
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "status") {
              setMessages((prev) => {
                const existing = prev.find((m) => m.id === statusId);
                if (existing) {
                  return prev.map((m) =>
                    m.id === statusId ? { ...m, content: parsed.text } : m
                  );
                }
                return [
                  ...prev,
                  {
                    id: statusId,
                    role: "system" as const,
                    content: parsed.text,
                    created_at: new Date().toISOString(),
                  },
                ];
              });
            } else if (parsed.type === "agent_done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === statusId
                    ? { ...m, content: `${parsed.name} responded ✓` }
                    : m
                )
              );
              // Add a new status message for next agent
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "system" as const,
                  content: `${parsed.name} responded ✓`,
                  created_at: new Date().toISOString(),
                },
              ]);
            } else if (parsed.type === "synthesis_complete") {
              // Remove the running status message
              setMessages((prev) => prev.filter((m) => m.id !== statusId));
              setSynthesis({ content: parsed.content, taskSummary: parsed.taskSummary });

              // Save the synthesis as an assistant message
              await saveMessage(cid, uid, "assistant", parsed.content);
              await supabase
                .from("conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", cid);
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Something went wrong during orchestration. Please try again.",
          agent_key: "alex",
          created_at: new Date().toISOString(),
        },
      ]);
    }
  }

  async function handleConfirmSend() {
    if (!synthesis) return;
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `LineSkip Team Brief: ${synthesis.taskSummary}`,
          body: synthesis.content,
        }),
      });

      await res.json();
      // Don't dismiss the card — let it show its own "sent" state so user can read the content
    } catch {
      // Email failed silently — card stays visible, user can still read content
    }
  }

  function handleCancelSend() {
    setSynthesis(null);
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white md:bg-apple-gray-50">
      <AgentHeader agentKey="alex" />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div
                className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-white font-semibold"
                style={{ background: alex.accent }}
              >
                {alex.initials}
              </div>
              <p className="text-apple-gray-950 font-medium text-sm">Alex</p>
              <p className="text-apple-gray-500 text-xs mt-1">Chief of Staff</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} currentAgentKey="alex" />
        ))}

        {isLoading && !messages.some((m) => m.isStreaming && m.content.length > 0) && (
          <TypingIndicator agentKey="alex" />
        )}

        {synthesis && (
          <SynthesisCard
            content={synthesis.content}
            taskSummary={synthesis.taskSummary}
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
