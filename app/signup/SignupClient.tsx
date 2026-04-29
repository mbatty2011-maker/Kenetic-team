"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleResend() {
    setResendStatus("sending");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    setResendStatus(error ? "error" : "sent");
    if (!error) setTimeout(() => setResendStatus("idle"), 5000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/callback?next=/onboarding`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.session) {
      router.push("/onboarding");
    } else {
      setVerified(true);
      setLoading(false);
    }
  }

  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <span
              className="text-white text-2xl font-bold tracking-[0.25em] uppercase"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              KNETC
            </span>
          </div>
          <div className="border border-white p-8 text-center">
            <div className="w-12 h-12 border border-white flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M2 11l6 6L20 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2
              className="text-white text-xs font-bold uppercase tracking-[0.25em] mb-4"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              Check Your Email
            </h2>
            <p
              className="text-white/60 text-xs mb-1"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              We sent a verification link to
            </p>
            <p
              className="text-white text-xs font-bold mb-4"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {email}
            </p>
            <p
              className="text-white/40 text-xs mb-2"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              Click the link to activate your account, then come back to sign in.
            </p>
            <p
              className="text-white/40 text-xs mb-6"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              Don't see it? Check your spam folder.
            </p>
            <button
              onClick={handleResend}
              disabled={resendStatus === "sending" || resendStatus === "sent"}
              className="text-xs text-white/50 hover:text-white disabled:opacity-30 transition-colors underline underline-offset-2"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {resendStatus === "sending" ? "Sending…" : resendStatus === "sent" ? "Email resent ✓" : resendStatus === "error" ? "Failed — try again" : "Didn't get it? Resend"}
            </button>
          </div>
          <p
            className="text-center text-xs text-white/40 mt-6"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Already verified?{" "}
            <Link href="/login" className="text-white hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <span
            className="text-white text-2xl font-bold tracking-[0.25em] uppercase"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            KNETC
          </span>
        </div>

        <div className="border border-white p-8">
          <h2
            className="text-white text-xs font-bold uppercase tracking-[0.25em] mb-8"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Create Account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                className="block text-white/60 text-xs uppercase tracking-widest mb-2"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                className="w-full bg-transparent border border-white text-white text-sm px-3 py-2.5 focus:outline-none placeholder:text-white/30 rounded-none"
                placeholder="Your name"
              />
            </div>

            <div>
              <label
                className="block text-white/60 text-xs uppercase tracking-widest mb-2"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-transparent border border-white text-white text-sm px-3 py-2.5 focus:outline-none placeholder:text-white/30 rounded-none"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                className="block text-white/60 text-xs uppercase tracking-widest mb-2"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-transparent border border-white text-white text-sm px-3 py-2.5 focus:outline-none placeholder:text-white/30 rounded-none"
                placeholder="Min. 6 characters"
              />
            </div>

            {error && (
              <p
                className="text-red-400 border border-red-500 px-3 py-2 text-xs"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black py-3 text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {loading ? "Creating account..." : "Create Account →"}
            </button>
          </form>
        </div>

        <p
          className="text-center text-xs text-white/40 mt-6"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          Already have an account?{" "}
          <Link href="/login" className="text-white hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
