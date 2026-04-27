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
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-12">
          <span
            className="text-white text-2xl font-bold tracking-[0.25em] uppercase block mb-6"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            KNETC
          </span>
          <h1 className="text-white text-2xl font-bold tracking-tight mb-2">
            What&apos;s on your mind?
          </h1>
          <p
            className="text-white/50 text-xs"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Tell Alex what you&apos;re working on — he&apos;ll loop in the right people.
          </p>
        </div>

        <div className="border border-white p-6">
          <textarea
            ref={textareaRef}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="We're building a SaaS for small restaurants. I need help figuring out our go-to-market strategy…"
            className="w-full bg-transparent border border-white text-white text-sm px-3 py-2.5 placeholder:text-white/30 focus:outline-none resize-none rounded-none"
          />

          <div className="mt-3 flex flex-col gap-1.5">
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => {
                  setText(chip);
                  textareaRef.current?.focus();
                }}
                className="text-left text-xs text-white/50 hover:text-white border border-white/30 hover:border-white px-3 py-2 transition-colors duration-200 truncate"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                {chip}
              </button>
            ))}
          </div>

          {error && (
            <p
              className="mt-3 text-red-400 border border-red-500 px-3 py-2 text-xs"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!text.trim() || loading}
            className="mt-5 w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            {loading ? "Setting up…" : "Talk to Alex →"}
          </button>

          <p
            className="text-center text-xs text-white/30 mt-3"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Press <kbd className="font-mono">⌘ Enter</kbd> to send
          </p>
        </div>
      </div>
    </div>
  );
}
