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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.session) {
      // Email confirmation disabled — go straight through
      router.push("/onboarding");
      router.refresh();
    } else {
      // Email confirmation required
      setVerified(true);
      setLoading(false);
    }
  }

  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-apple-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-apple-xl bg-apple-gray-950 mb-4 shadow-apple-md">
            <span className="text-white font-semibold text-xl tracking-tight">K</span>
          </div>
          <div className="bg-white rounded-apple-2xl shadow-apple-md p-8">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M2 11l6 6L20 4" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-apple-gray-950 mb-2">Check your email</h2>
            <p className="text-sm text-apple-gray-500 mb-1">
              We sent a verification link to
            </p>
            <p className="text-sm font-medium text-apple-gray-950 mb-4">{email}</p>
            <p className="text-xs text-apple-gray-400">
              Click the link in the email to activate your account, then come back here to sign in.
            </p>
          </div>
          <p className="text-center text-sm text-apple-gray-500 mt-6">
            Already verified?{" "}
            <Link href="/login" className="text-apple-gray-950 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-apple-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-apple-xl bg-apple-gray-950 mb-4 shadow-apple-md">
            <span className="text-white font-semibold text-xl tracking-tight">K</span>
          </div>
          <h1 className="text-2xl font-semibold text-apple-gray-950 tracking-tight">Kenetic</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-apple-2xl shadow-apple-md p-8">
          <h2 className="text-lg font-semibold text-apple-gray-950 mb-6">Create account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-apple-gray-700 mb-1.5">
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                className="w-full px-3.5 py-2.5 rounded-apple-md border border-apple-gray-200 text-sm text-apple-gray-950 placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-gray-950 focus:border-transparent transition-all"
                placeholder="Your name"
              />
            </div>

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
                minLength={6}
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 rounded-apple-md border border-apple-gray-200 text-sm text-apple-gray-950 placeholder:text-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-apple-gray-950 focus:border-transparent transition-all"
                placeholder="Min. 6 characters"
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
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-apple-gray-500 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-apple-gray-950 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
