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
  const [orchestrationMode, setOrchestrationMode] = useState(false);
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
      setOrchestrationMode(false);
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

    // Check if we're already in orchestration mode (Alex asked clarifying questions)
    if (orchestrationMode) {
      // Check if previous alex message contains READY_TO_BRIEF
      const lastAlexMsg = [...messages].reverse().find((m) => m.role === "assistant");
      if (lastAlexMsg?.content.includes("READY_TO_BRIEF:")) {
        // Extract task summary and run full orchestration
        const taskMatch = lastAlexMsg.content.match(/READY_TO_BRIEF:\s*(.+)/);
        const taskSummary = taskMatch?.[1]?.trim() || content;
        await runOrchestration(cid, user.id, taskSummary);
        setIsLoading(false);
        return;
      }

      // Still in clarification — check if user answered and Alex is ready
      await streamAlexResponse(content, cid, user.id, "clarify");
    } else {
      await streamAlexResponse(content, cid, user.id, "classify");
    }

    setIsLoading(false);
  }

  async function streamAlexResponse(
    content: string,
    cid: string,
    uid: string,
    mode: string
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
        body: JSON.stringify({ message: content, conversationId: cid, mode }),
      });

      if (!res.body) throw new Error("No body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "orchestrate_start") {
              setOrchestrationMode(true);
            } else if (parsed.type === "text") {
              fullContent += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === streamingId ? { ...m, content: fullContent } : m
                )
              );

              // Check if Alex said READY_TO_BRIEF — means next message triggers orchestration
              if (fullContent.includes("READY_TO_BRIEF:")) {
                setOrchestrationMode(true);
              }
            } else if (parsed.type === "done") {
              break;
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

  async function runOrchestration(cid: string, uid: string, taskSummary: string) {
    // Clear orchestration flag
    setOrchestrationMode(false);

    const statusId = crypto.randomUUID();

    try {
      const res = await fetch("/api/alex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: taskSummary, conversationId: cid, mode: "orchestrate" }),
      });

      if (!res.body) throw new Error("No body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
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
      setSynthesis(null);

      const successMsg: Message = {
        id: crypto.randomUUID(),
        role: "system",
        content: `Sent to mbatty2011@gmail.com ✓`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, successMsg]);
    } catch {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "system",
        content: "Failed to send email. Check Gmail configuration.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
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

        {isLoading && !messages.some((m) => m.isStreaming) && (
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
