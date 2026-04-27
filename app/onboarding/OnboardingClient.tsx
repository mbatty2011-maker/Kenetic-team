"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EXAMPLE_CHIPS = [
  "We're launching our first paid tier next month and I'm not sure where to focus",
  "I need to hire my first salesperson but don't know where to start",
  "We have 50 users but zero revenue — help me figure out pricing",
];

export default function OnboardingClient() {
  const router = useRouter();
  const supabase = createClient();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, agent_key: "alex", title: text.slice(0, 60) })
        .select()
        .single();
      if (convError || !conversation) throw new Error("Failed to create conversation");

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        user_id: user.id,
        agent_key: "alex",
        role: "user",
        content: text,
      });

      await Promise.all([
        supabase.from("profiles").update({
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        }).eq("id", user.id),
        supabase.from("knowledge_base").insert({
          user_id: user.id,
          section_title: "Initial context",
          content: text,
        }),
        fetch("/api/welcome", { method: "POST" }).catch(() => {}),
      ]);

      router.push(`/chat/alex?cid=${conversation.id}&autostart=1`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-apple-gray-50 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-apple-xl bg-apple-gray-950 mb-4 shadow-apple-md">
            <span className="text-white font-semibold text-xl tracking-tight">K</span>
          </div>
          <h1 className="text-2xl font-semibold text-apple-gray-950 tracking-tight">
            What&apos;s on your mind?
          </h1>
          <p className="text-sm text-apple-gray-500 mt-1">
            Tell Alex what you&apos;re working on — he&apos;ll loop in the right people.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-apple-2xl shadow-apple-md p-8">
          <textarea
            ref={textareaRef}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="We're building a SaaS for small restaurants. I need help figuring out our go-to-market strategy…"
            className="w-full px-3.5 py-2.5 rounded-apple-md border border-apple-gray-200 text-sm text-apple-gray-950 placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-gray-950 focus:border-transparent transition-all resize-none"
          />

          {/* Example chips */}
          <div className="mt-3 flex flex-col gap-1.5">
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => {
                  setText(chip);
                  textareaRef.current?.focus();
                }}
                className="text-left text-xs text-apple-gray-500 hover:text-apple-gray-800 bg-apple-gray-50 hover:bg-apple-gray-100 border border-apple-gray-100 rounded-apple-md px-3 py-2 transition-all truncate"
              >
                {chip}
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-500 bg-red-50 rounded-apple-md px-3.5 py-2.5">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!text.trim() || loading}
            className="mt-5 w-full py-2.5 bg-apple-gray-950 text-white text-sm font-medium rounded-apple-md hover:bg-apple-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-apple-sm"
          >
            {loading ? "Setting up…" : "Talk to Alex →"}
          </button>

          <p className="text-center text-xs text-apple-gray-400 mt-3">
            Press <kbd className="font-mono">⌘ Enter</kbd> to send
          </p>
        </div>
      </div>
    </div>
  );
}
