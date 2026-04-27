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
    <div className="h-screen overflow-y-auto bg-apple-gray-50">
      {/* Header */}
      <div className="glass border-b border-apple-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/chat"
            className="p-2 rounded-apple-md hover:bg-apple-gray-100 transition-colors text-apple-gray-500 hover:text-apple-gray-950"
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
          <h1 className="text-lg font-semibold text-apple-gray-950">Plans &amp; Pricing</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 pb-16">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-semibold text-apple-gray-950 mb-2">
            Your AI executive team
          </h2>
          <p className="text-apple-gray-500 text-base">
            Pick the plan that fits your stage. Upgrade or cancel anytime.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-100 rounded-apple-md text-sm text-red-600 text-center animate-fade-in">
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-apple-xl flex flex-col overflow-hidden transition-all ${
                plan.featured
                  ? "shadow-apple-lg ring-2 ring-apple-gray-950"
                  : "shadow-apple-sm"
              }`}
            >
              {plan.featured && (
                <div className="bg-apple-gray-950 text-white text-xs font-medium text-center py-1.5 tracking-wide">
                  Most Popular
                </div>
              )}

              <div className="p-6 flex flex-col flex-1">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-apple-gray-950 mb-0.5">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-apple-gray-400">{plan.tagline}</p>
                </div>

                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-apple-gray-950">
                    ${plan.price}
                  </span>
                  <span className="text-apple-gray-400 text-sm">/mo</span>
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-apple-gray-700"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="flex-shrink-0 mt-0.5 text-apple-gray-950"
                      >
                        <path
                          d="M3 8L6.5 11.5L13 5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={loading !== null}
                  className={`w-full py-2.5 rounded-apple-md text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.featured
                      ? "bg-apple-gray-950 text-white hover:bg-apple-gray-800"
                      : "bg-apple-gray-100 text-apple-gray-950 hover:bg-apple-gray-200"
                  }`}
                >
                  {loading === plan.tier ? "Redirecting…" : plan.cta}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-apple-gray-400 mt-8">
          Billed monthly. Cancel anytime. Questions?{" "}
          <a
            href="mailto:hello@knetc.team"
            className="underline hover:text-apple-gray-600 transition-colors"
          >
            Contact us
          </a>
          .
        </p>
      </div>
    </div>
  );
}
