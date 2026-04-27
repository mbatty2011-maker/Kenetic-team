"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const AGENTS = [
  { initial: "A", name: "ALEX",   role: "Chief of Staff" },
  { initial: "M", name: "MARCUS", role: "General Counsel" },
  { initial: "J", name: "JEREMY", role: "CFO" },
  { initial: "D", name: "DANA",   role: "Head of Sales" },
  { initial: "M", name: "MAYA",   role: "Head of Marketing" },
  { initial: "K", name: "KAI",    role: "CTO" },
];

const FEATURES = [
  {
    num: "01",
    title: "ALWAYS\nAVAILABLE",
    body: "No scheduling. No delays. Ask a question and get a considered expert answer in seconds.",
  },
  {
    num: "02",
    title: "FULL CONTEXT\nMEMORY",
    body: "Every decision, every conversation — remembered forever. Never repeat yourself again.",
  },
  {
    num: "03",
    title: "BUILT FOR\nFOUNDERS",
    body: "From pre-seed to scale, your team adapts to the problems that matter most at your stage.",
  },
];

const PLANS = [
  {
    name: "SOLO",
    price: 79,
    tagline: "For the individual founder starting out.",
    features: [
      "All 6 AI agents",
      "15 messages per agent / month",
      "7-day agent memory",
      "File generation (PDF, DOCX, XLSX)",
      "Email drafting",
    ],
    featured: false,
  },
  {
    name: "STARTUP",
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
    featured: true,
  },
  {
    name: "SCALE",
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
    featured: false,
  },
];

function HeroLine({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <div className="overflow-hidden leading-none">
      <motion.div
        initial={{ y: "110%" }}
        animate={{ y: "0%" }}
        transition={{ duration: 0.95, delay, ease: EASE }}
      >
        {children}
      </motion.div>
    </div>
  );
}

function ScrollReveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export default function Home() {
  return (
    <div
      className="bg-black text-white selection:bg-white selection:text-black"
      style={{ fontFamily: "var(--font-space-grotesk), system-ui, sans-serif" }}
    >
      {/* ── NAV ──────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6"
        style={{ mixBlendMode: "difference" }}
      >
        <span
          className="text-white text-sm font-bold tracking-[0.25em] uppercase"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          KNETC
        </span>
        <Link
          href="/signup"
          aria-label="Sign up for knetc for free"
          className="text-white border border-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 hover:bg-white hover:text-black transition-colors duration-200"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          Sign Up Free
        </Link>
      </motion.nav>

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section
        className="min-h-screen flex flex-col justify-between px-8 pt-32 pb-12"
        aria-label="Hero"
      >
        <div className="overflow-hidden">
          <motion.p
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
            className="text-xs uppercase tracking-[0.3em]"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            AI Executive Team · Always On
          </motion.p>
        </div>

        <div>
          <HeroLine delay={0.4}>
            <h1 className="text-[clamp(3rem,9.5vw,9rem)] font-bold tracking-tight uppercase pb-1">
              Your
            </h1>
          </HeroLine>
          <HeroLine delay={0.58}>
            <h1 className="text-[clamp(3rem,9.5vw,9rem)] font-bold tracking-tight uppercase pb-1">
              Executive
            </h1>
          </HeroLine>
          <HeroLine delay={0.76}>
            <h1 className="text-[clamp(3rem,9.5vw,9rem)] font-bold tracking-tight uppercase">
              Team.
            </h1>
          </HeroLine>
        </div>

        <div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.1, delay: 1.0, ease: EASE }}
            className="h-px bg-white origin-left mb-8"
          />
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-8">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 1.15 }}
              className="text-sm leading-[1.8] max-w-xs"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              CFO · CTO · Head of Sales
              <br />
              General Counsel · Chief of Staff
              <br />
              Head of Marketing · Available 24/7.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.3, ease: EASE }}
            >
              <Link
                href="/signup"
                aria-label="Sign up for knetc for free"
                className="group inline-flex items-center gap-3 bg-white text-black px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-300"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                Sign Up Free
                <span className="inline-block group-hover:translate-x-1.5 transition-transform duration-300">
                  →
                </span>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── AGENT SHOWCASE ───────────────────────────────────────── */}
      <section className="border-t border-white px-8 py-24" aria-label="Meet the team">
        <ScrollReveal>
          <p
            className="text-xs uppercase tracking-[0.3em] mb-14"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Meet The Team
          </p>
        </ScrollReveal>

        {/* gap-px bg-white: parent white bg shows through as 1px white dividers */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white border border-white">
          {AGENTS.map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: EASE }}
              className="relative bg-black group overflow-hidden aspect-square flex flex-col justify-between p-6 sm:p-8 cursor-default"
            >
              {/* Wipe fill from bottom on hover */}
              <div className="absolute inset-0 bg-white origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-300 ease-out" />

              <span
                className="relative z-10 font-bold text-white group-hover:text-black transition-colors duration-200"
                style={{
                  fontSize: "clamp(2rem, 5vw, 3.5rem)",
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                  lineHeight: 1,
                }}
              >
                {agent.initial}
              </span>

              <div className="relative z-10">
                <p className="font-bold uppercase text-sm text-white group-hover:text-black transition-colors duration-200 leading-none">
                  {agent.name}
                </p>
                <p
                  className="text-xs text-white/50 group-hover:text-black/60 transition-colors duration-200 mt-1"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {agent.role}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── VALUE PROPS ──────────────────────────────────────────── */}
      <section className="border-t border-white py-24 px-8" aria-label="Why knetc">
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <ScrollReveal key={f.num} delay={i * 0.12}>
              <div
                className={[
                  "py-10 lg:py-0",
                  i > 0
                    ? "border-t border-white lg:border-t-0 lg:border-l lg:pl-10"
                    : "",
                  i < FEATURES.length - 1 ? "lg:pr-10" : "",
                ].join(" ")}
              >
                <p
                  className="text-xs mb-8"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {f.num}
                </p>
                <h2 className="text-base font-bold uppercase tracking-widest mb-6 whitespace-pre-line leading-snug">
                  {f.title}
                </h2>
                <p
                  className="text-sm leading-relaxed"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {f.body}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ── THE BOARDROOM ────────────────────────────────────────── */}
      <section className="bg-white text-black px-8 py-24" aria-label="The Boardroom">
        <div className="max-w-4xl">
          <ScrollReveal>
            <p
              className="text-xs uppercase tracking-[0.3em] mb-14"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              The Boardroom
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <h2 className="text-[clamp(2.2rem,6vw,5.5rem)] font-bold uppercase tracking-tight leading-none mb-10">
              All Six.
              <br />
              One Brief.
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <p
              className="text-sm leading-[2] max-w-md mb-14"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              Ask one question and every agent responds. Alex synthesises their
              answers into a single executive brief — and sends it to your inbox.
              Your boardroom, on demand.
            </p>
          </ScrollReveal>

          {/* Agent name cards — gap-px bg-black on white section */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
            {AGENTS.map((agent, i) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.06, ease: EASE }}
                className="bg-white px-5 py-4"
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {agent.name}
                </p>
                <p
                  className="text-xs text-black/50 mt-0.5"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {agent.role}
                </p>
              </motion.div>
            ))}
          </div>

          <ScrollReveal delay={0.5}>
            <div className="border-t border-black pt-8 flex items-center gap-5">
              <div className="w-2 h-2 bg-black flex-shrink-0" />
              <p
                className="text-xs uppercase tracking-widest"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                Synthesis delivered to your inbox in minutes
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────── */}
      <section className="border-t border-white py-24 px-8" aria-label="Pricing">
        <ScrollReveal>
          <p
            className="text-xs uppercase tracking-[0.3em] mb-14"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Pricing
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.08}>
          <h2 className="text-[clamp(2rem,6vw,5rem)] font-bold uppercase tracking-tight leading-none mb-16">
            One Team.
            <br />
            Three Plans.
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-white border border-white">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.75, delay: i * 0.1, ease: EASE }}
              className={[
                "flex flex-col p-8 h-full",
                plan.featured ? "bg-white text-black" : "bg-black text-white",
              ].join(" ")}
            >
              <div className="flex items-start justify-between mb-6">
                <p
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {plan.name}
                </p>
                {plan.featured && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest bg-black text-white px-2 py-1"
                    style={{ fontFamily: "var(--font-space-mono), monospace" }}
                  >
                    Most Popular
                  </span>
                )}
              </div>

              <div className="mb-4 flex items-baseline gap-1.5">
                <span
                  className="font-bold leading-none"
                  style={{
                    fontSize: "clamp(2.5rem, 5vw, 4rem)",
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                  }}
                >
                  ${plan.price}
                </span>
                <span
                  className={[
                    "text-xs",
                    plan.featured ? "text-black/50" : "text-white/50",
                  ].join(" ")}
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  /mo
                </span>
              </div>

              <p
                className={[
                  "text-xs leading-relaxed mb-8",
                  plan.featured ? "text-black/60" : "text-white/50",
                ].join(" ")}
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                {plan.tagline}
              </p>

              <ul className="space-y-3 mb-10 flex-1">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-3">
                    <div
                      className={[
                        "w-1.5 h-1.5 mt-1.5 flex-shrink-0",
                        plan.featured ? "bg-black" : "bg-white",
                      ].join(" ")}
                    />
                    <span
                      className={[
                        "text-xs leading-relaxed",
                        plan.featured ? "text-black/80" : "text-white/70",
                      ].join(" ")}
                      style={{ fontFamily: "var(--font-space-mono), monospace" }}
                    >
                      {feat}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                aria-label={`Sign up for the ${plan.name} plan`}
                className={[
                  "block text-center py-3.5 text-xs font-bold uppercase tracking-widest border transition-colors duration-200",
                  plan.featured
                    ? "bg-black text-white border-black hover:bg-white hover:text-black"
                    : "bg-white text-black border-white hover:bg-black hover:text-white",
                ].join(" ")}
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                Get Started
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="py-40 px-8 text-center" aria-label="Call to action">
        <ScrollReveal>
          <p
            className="text-xs uppercase tracking-[0.3em] mb-10"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Ready?
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <h2 className="text-[clamp(2.5rem,9vw,8rem)] font-bold uppercase tracking-tight leading-none mb-16">
            Meet Your
            <br />
            Team.
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.22}>
          <Link
            href="/signup"
            aria-label="Sign up for knetc for free"
            className="inline-flex items-center gap-4 bg-white text-black px-14 py-6 text-sm font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-300"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Sign Up Free
          </Link>
        </ScrollReveal>
        <ScrollReveal delay={0.34}>
          <p
            className="text-xs uppercase tracking-widest mt-10 opacity-60"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            No credit card required · Start in seconds
          </p>
        </ScrollReveal>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-white px-8 py-8 flex items-center justify-between">
        <span
          className="text-xs font-bold tracking-[0.25em] uppercase"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          KNETC
        </span>
        <span
          className="text-xs opacity-40"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          © {new Date().getFullYear()} knetc
        </span>
      </footer>
    </div>
  );
}
