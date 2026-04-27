"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Tier = "starter" | "pro" | "enterprise";

const PLANS: {
  name: string;
  tier: Tier;
  price: number;
  tagline: string;
  features: string[];
  cta: string;
  featured: boolean;
}[] = [
  {
    name: "Solo",
    tier: "starter",
    price: 79,
    tagline: "For the individual founder moving fast.",
    features: [
      "All 6 AI agents",
      "15 messages per agent / month",
      "7-day agent memory",
      "File generation (PDF, DOCX, XLSX)",
      "Email drafting",
    ],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Startup",
    tier: "pro",
    price: 199,
    tagline: "Everything you need to run your company with AI.",
    features: [
      "All 6 AI agents",
      "Unlimited messages",
      "1-year agent memory",
      "File generation (PDF, DOCX, XLSX)",
      "Email drafting",
      "Priority support",
    ],
    cta: "Get started",
    featured: true,
  },
  {
    name: "Scale",
    tier: "enterprise",
    price: 499,
    tagline: "For teams that run entirely on AI.",
    features: [
      "All 6 AI agents",
      "Team seats — unlimited",
      "Unlimited everything",
      "1-year agent memory",
      "File generation (PDF, DOCX, XLSX)",
      "Email drafting",
      "Priority support",
      "Dedicated onboarding",
    ],
    cta: "Get started",
    featured: false,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(tier: Tier) {
    setLoading(tier);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      if (res.status === 401) {
        router.push("/login?next=/pricing");
        return;
      }

      let data: { url?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // non-JSON body (e.g. middleware redirect returned HTML)
      }

      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status}). Please try again.`);
        setLoading(null);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("No checkout URL returned. Please try again.");
        setLoading(null);
      }
    } catch (err) {
      console.error("Stripe checkout error:", err);
      setError(err instanceof Error ? err.message : String(err));
      setLoading(null);
    }
  }

  return (
    <div className="h-screen overflow-y-auto bg-black">
      {/* Header */}
      <div className="border-b border-white sticky top-0 z-10 bg-black">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/chat"
            className="p-2 border border-white text-white hover:bg-white hover:text-black transition-colors duration-200"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M11 4L6 9L11 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <h1
            className="text-white text-xs font-bold uppercase tracking-widest"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Plans &amp; Pricing
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 pb-16">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-white text-3xl font-bold tracking-tight mb-2 uppercase">
            Your AI Executive Team
          </h2>
          <p
            className="text-white/50 text-xs"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Pick the plan that fits your stage. Upgrade or cancel anytime.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="mb-6 px-4 py-3 border border-red-500 text-red-400 text-xs text-center"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col overflow-hidden ${
                plan.featured
                  ? "bg-white text-black"
                  : "bg-black text-white border border-white"
              }`}
            >
              {plan.featured && (
                <div
                  className="bg-black text-white text-xs font-bold text-center py-1.5 tracking-widest uppercase"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  Most Popular
                </div>
              )}

              <div className="p-6 flex flex-col flex-1">
                <div className="mb-5">
                  <h3 className="text-base font-bold uppercase tracking-widest mb-0.5">
                    {plan.name}
                  </h3>
                  <p
                    className={`text-xs ${plan.featured ? "text-black/50" : "text-white/50"}`}
                    style={{ fontFamily: "var(--font-space-mono), monospace" }}
                  >
                    {plan.tagline}
                  </p>
                </div>

                <div className="mb-6 flex items-baseline gap-1">
                  <span
                    className="text-4xl font-bold"
                    style={{ fontFamily: "var(--font-space-mono), monospace" }}
                  >
                    ${plan.price}
                  </span>
                  <span
                    className={`text-xs ${plan.featured ? "text-black/50" : "text-white/50"}`}
                    style={{ fontFamily: "var(--font-space-mono), monospace" }}
                  >
                    /mo
                  </span>
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-xs"
                      style={{ fontFamily: "var(--font-space-mono), monospace" }}
                    >
                      <span className="font-bold flex-shrink-0 mt-0.5">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={loading !== null}
                  className={`w-full py-3 text-xs font-bold uppercase tracking-widest transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                    plan.featured
                      ? "bg-black text-white border border-black hover:bg-white hover:text-black hover:border-black"
                      : "bg-white text-black border border-white hover:bg-black hover:text-white"
                  }`}
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {loading === plan.tier ? "Redirecting…" : plan.cta}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p
          className="text-center text-xs text-white/30 mt-8"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          Billed monthly. Cancel anytime. Questions?{" "}
          <a
            href="mailto:hello@knetc.team"
            className="underline hover:text-white transition-colors"
          >
            Contact us
          </a>
          .
        </p>
      </div>
    </div>
  );
}
