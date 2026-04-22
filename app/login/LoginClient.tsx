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
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-apple-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-apple-xl bg-apple-gray-950 mb-4 shadow-apple-md">
            <span className="text-white font-semibold text-xl tracking-tight">L</span>
          </div>
          <h1 className="text-2xl font-semibold text-apple-gray-950 tracking-tight">knetc</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-apple-2xl shadow-apple-md p-8">
          <h2 className="text-lg font-semibold text-apple-gray-950 mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-apple-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-apple-md border border-apple-gray-200 text-sm text-apple-gray-950 placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-gray-950 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-apple-gray-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 rounded-apple-md border border-apple-gray-200 text-sm text-apple-gray-950 placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-gray-950 focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-apple-md px-3.5 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-apple-gray-950 text-white py-2.5 rounded-apple-md text-sm font-medium hover:bg-apple-gray-800 active:bg-apple-gray-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-apple-sm"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-apple-gray-500 mt-6">
          No account?{" "}
          <Link href="/signup" className="text-apple-gray-950 font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
