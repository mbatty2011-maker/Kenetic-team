"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/chat");
    }
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
            Sign In
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
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
                autoComplete="current-password"
                className="w-full bg-transparent border border-white text-white text-sm px-3 py-2.5 focus:outline-none placeholder:text-white/30 rounded-none"
                placeholder="••••••••"
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
              {loading ? "Signing in..." : "Sign In →"}
            </button>
          </form>
        </div>

        <p
          className="text-center text-xs text-white/40 mt-6"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          No account?{" "}
          <Link href="/signup" className="text-white hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
