"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STAGES = ["Just an idea", "Building MVP", "Early customers", "Growing", "Scaling"];

interface Answers {
  companyName: string;
  whatYouBuild: string;
  roleTitle: string;
  stage: string;
  goals: string;
}

const STEPS = [
  {
    key: "companyName" as const,
    question: "What's your company or project called?",
    placeholder: "Acme Inc.",
    hint: "Just the name — we'll use this across your team.",
    type: "text",
  },
  {
    key: "whatYouBuild" as const,
    question: "What does your company do?",
    placeholder: "We build a virtual AI team for founders and small businesses…",
    hint: "A sentence or two is perfect.",
    type: "textarea",
  },
  {
    key: "roleTitle" as const,
    question: "What's your role?",
    placeholder: "Founder & CEO",
    hint: "How should your team address you?",
    type: "text",
  },
  {
    key: "stage" as const,
    question: "Where are you right now?",
    placeholder: "",
    hint: "Your team will tailor their advice to your stage.",
    type: "select",
  },
  {
    key: "goals" as const,
    question: "What's most important to you right now?",
    placeholder: "Launching our first paid tier by end of month, finding 10 design partners, and getting PR coverage…",
    hint: "Goals, priorities, anything your team should always keep in mind.",
    type: "textarea",
  },
];

export default function OnboardingClient({ userName }: { userName: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    companyName: "",
    whatYouBuild: "",
    roleTitle: "",
    stage: "",
    goals: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const current = STEPS[step];
  const value = answers[current.key];
  const isLast = step === STEPS.length - 1;
  const canAdvance = value.trim().length > 0;

  function handleChange(val: string) {
    setAnswers((prev) => ({ ...prev, [current.key]: val }));
  }

  function handleNext() {
    if (!canAdvance) return;
    if (isLast) {
      handleFinish();
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && current.type !== "textarea" && canAdvance) {
      e.preventDefault();
      handleNext();
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const userContext = [
        `Company: ${answers.companyName}`,
        `What they do: ${answers.whatYouBuild}`,
        `Stage: ${answers.stage}`,
        `Current goals and priorities:\n${answers.goals}`,
      ].join("\n");

      // Update existing profile row (created by trigger on signup)
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: userName,
          company_name: answers.companyName,
          role_title: answers.roleTitle,
          user_context: userContext,
          onboarding_complete: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        // Row doesn't exist yet — insert it
        const { error: insertError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            full_name: userName,
            company_name: answers.companyName,
            role_title: answers.roleTitle,
            user_context: userContext,
            onboarding_complete: true,
            updated_at: new Date().toISOString(),
          });
        if (insertError) throw insertError;
      }

      // Fire welcome email — non-blocking
      fetch("/api/welcome", { method: "POST" }).catch(() => {});

      router.push("/chat");
    } catch (err) {
      console.error("Onboarding save error:", err);
      const msg =
        err instanceof Error ? err.message :
        (err as { message?: string })?.message ||
        JSON.stringify(err);
      setError(msg || "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  const progressPct = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center bg-apple-gray-50 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-apple-xl bg-apple-gray-950 mb-4 shadow-apple-md">
            <span className="text-white font-semibold text-xl tracking-tight">L</span>
          </div>
          <h1 className="text-2xl font-semibold text-apple-gray-950 tracking-tight">
            {userName ? `Welcome, ${userName.split(" ")[0]}` : "Welcome"}
          </h1>
          <p className="text-sm text-apple-gray-500 mt-1">
            Let&apos;s introduce you to your team
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-apple-gray-100 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-apple-gray-950 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-apple-2xl shadow-apple-md p-8">
          <div className="mb-1 text-xs font-medium text-apple-gray-400 uppercase tracking-wider">
            {step + 1} of {STEPS.length}
          </div>

          <h2 className="text-xl font-semibold text-apple-gray-950 mb-1 leading-snug">
            {current.question}
          </h2>
          <p className="text-sm text-apple-gray-400 mb-6">{current.hint}</p>

          {current.type === "text" && (
            <input
              key={current.key}
              type="text"
              autoFocus
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={current.placeholder}
              className="w-full px-3.5 py-2.5 rounded-apple-md border border-apple-gray-200 text-sm text-apple-gray-950 placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-gray-950 focus:border-transparent transition-all"
            />
          )}

          {current.type === "textarea" && (
            <textarea
              key={current.key}
              autoFocus
              rows={4}
              value={value}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={current.placeholder}
              className="w-full px-3.5 py-2.5 rounded-apple-md border border-apple-gray-200 text-sm text-apple-gray-950 placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-gray-950 focus:border-transparent transition-all resize-none"
            />
          )}

          {current.type === "select" && (
            <div className="grid grid-cols-1 gap-2">
              {STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleChange(s)}
                  className={`text-left px-4 py-3 rounded-apple-md border text-sm font-medium transition-all ${
                    value === s
                      ? "border-apple-gray-950 bg-apple-gray-950 text-white"
                      : "border-apple-gray-200 text-apple-gray-700 hover:border-apple-gray-400 hover:bg-apple-gray-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-500 bg-red-50 rounded-apple-md px-3.5 py-2.5">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={handleBack}
                disabled={saving}
                className="px-4 py-2.5 text-sm text-apple-gray-600 hover:text-apple-gray-950 rounded-apple-md hover:bg-apple-gray-100 transition-all disabled:opacity-50"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canAdvance || saving}
              className="ml-auto px-6 py-2.5 bg-apple-gray-950 text-white text-sm font-medium rounded-apple-md hover:bg-apple-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-apple-sm"
            >
              {saving ? "Saving…" : isLast ? "Meet my team →" : "Next →"}
            </button>
          </div>
        </div>

        {/* Skip */}
        <p className="text-center text-xs text-apple-gray-400 mt-4">
          <button
            onClick={async () => {
              setSaving(true);
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  await supabase.from("profiles").upsert({
                    id: user.id,
                    onboarding_complete: true,
                    updated_at: new Date().toISOString(),
                  });
                }
                router.push("/chat");
              } catch {
                setSaving(false);
              }
            }}
            className="hover:text-apple-gray-600 transition-colors"
          >
            Skip for now
          </button>
        </p>
      </div>
    </div>
  );
}
