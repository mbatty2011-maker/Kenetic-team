"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EXAMPLE_CHIPS = [
  "We're launching our first paid tier next month and I'm not sure where to focus",
  "I need to hire my first salesperson but don't know where to start",
  "We have 50 users but zero revenue — help me figure out pricing",
];

type Step = "context" | "google";

type GoogleStatus = { connected: boolean; email?: string };

export default function OnboardingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [step, setStep] = useState<Step>("context");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [googleError, setGoogleError] = useState("");
  const [continuing, setContinuing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const monoStyle = { fontFamily: "var(--font-space-mono), monospace" };

  useEffect(() => {
    if (step === "context") textareaRef.current?.focus();
  }, [step]);

  // If we land on /onboarding with ?google=connected|error, jump straight
  // to step 2 so the user can confirm the connection or skip.
  useEffect(() => {
    const param = searchParams.get("google");
    if (param) setStep("google");
  }, [searchParams]);

  const refreshGoogleStatus = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: rpcErr } = await (supabase as any).rpc("get_oauth_connection_status", {
      p_provider: "google",
    });
    if (rpcErr) {
      setGoogle({ connected: false });
      return;
    }
    const row = (data as { google_email?: string }[] | null)?.[0];
    setGoogle({ connected: !!row, email: row?.google_email });
  }, [supabase]);

  useEffect(() => {
    if (step !== "google") return;
    refreshGoogleStatus();
    const param = searchParams.get("google");
    if (param === "error") {
      const reason = searchParams.get("reason") ?? "unknown_error";
      setGoogleError(`Couldn't connect Google (${reason}). You can try again or skip.`);
    } else {
      setGoogleError("");
    }
  }, [step, searchParams, refreshGoogleStatus]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleContextSubmit();
    }
  }

  async function handleContextSubmit() {
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
        supabase.from("knowledge_base").insert({
          user_id: user.id,
          section_title: "Initial context",
          content: text,
        }),
        fetch("/api/welcome", { method: "POST" }).catch(() => {}),
      ]);

      setConversationId(conversation.id);
      setStep("google");
      setLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      setLoading(false);
    }
  }

  async function completeAndContinue() {
    if (continuing) return;
    setContinuing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      await supabase.from("profiles").update({
        onboarding_complete: true,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);

      // If the user reached step 2 by returning from OAuth (not by completing
      // step 1 in this session), conversationId may be null — fall back to
      // /chat in that case.
      if (conversationId) {
        router.push(`/chat/alex?cid=${conversationId}&autostart=1`);
      } else {
        router.push("/chat/alex");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setGoogleError(msg);
      setContinuing(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-12">
          <span
            className="text-white text-2xl font-bold tracking-[0.25em] uppercase block mb-6"
            style={monoStyle}
          >
            KNETC
          </span>
          {step === "context" ? (
            <>
              <h1 className="text-white text-2xl font-bold tracking-tight mb-2">
                What&apos;s on your mind?
              </h1>
              <p className="text-white/50 text-xs" style={monoStyle}>
                Tell Alex what you&apos;re working on — he&apos;ll loop in the right people.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-white text-2xl font-bold tracking-tight mb-2">
                Connect your Google account
              </h1>
              <p className="text-white/50 text-xs" style={monoStyle}>
                Optional — lets Alex read your inbox, draft replies, and check your calendar.
              </p>
            </>
          )}
        </div>

        {step === "context" && (
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
                  style={monoStyle}
                >
                  {chip}
                </button>
              ))}
            </div>

            {error && (
              <p className="mt-3 text-red-400 border border-red-500 px-3 py-2 text-xs" style={monoStyle}>
                {error}
              </p>
            )}

            <button
              onClick={handleContextSubmit}
              disabled={!text.trim() || loading}
              className="mt-5 w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
              style={monoStyle}
            >
              {loading ? "Setting up…" : "Continue →"}
            </button>

            <p className="text-center text-xs text-white/30 mt-3" style={monoStyle}>
              Press <kbd className="font-mono">⌘ Enter</kbd> to continue
            </p>
          </div>
        )}

        {step === "google" && (
          <div className="border border-white p-6 space-y-4">
            {google?.connected ? (
              <div className="border border-white/30 px-4 py-3 text-white text-sm" style={monoStyle}>
                ✓ Connected as {google.email ?? "your Google account"}
              </div>
            ) : (
              <div className="space-y-2 text-white/60 text-xs leading-relaxed" style={monoStyle}>
                <p>You&apos;ll be redirected to Google to grant access to:</p>
                <ul className="list-disc list-inside space-y-1 text-white/40">
                  <li>Gmail (read, send, label, draft)</li>
                  <li>Calendar (read, create, update events)</li>
                  <li>Docs, Sheets, Drive (files Alex creates for you)</li>
                </ul>
                <p className="text-white/40">You can connect later from Settings → Integrations.</p>
              </div>
            )}

            {googleError && (
              <p className="text-red-400 border border-red-500 px-3 py-2 text-xs" style={monoStyle}>
                {googleError}
              </p>
            )}

            {google?.connected ? (
              <button
                onClick={completeAndContinue}
                disabled={continuing}
                className="w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 disabled:opacity-30"
                style={monoStyle}
              >
                {continuing ? "Loading…" : "Talk to Alex →"}
              </button>
            ) : (
              <div className="space-y-2">
                <a
                  href="/api/oauth/google/start?next=/onboarding"
                  className="block w-full py-3 text-center bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200"
                  style={monoStyle}
                >
                  Connect Google Account
                </a>
                <button
                  onClick={completeAndContinue}
                  disabled={continuing}
                  className="block w-full py-3 text-center text-white/50 hover:text-white text-xs font-bold uppercase tracking-widest border border-white/30 hover:border-white transition-colors duration-200 disabled:opacity-30"
                  style={monoStyle}
                >
                  {continuing ? "Loading…" : "Skip for now"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
