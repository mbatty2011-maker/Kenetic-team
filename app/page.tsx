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
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
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
      {/* ── NAV ──────────────────────────────────────────────────────
          mix-blend-mode: difference auto-inverts over white sections.
      ──────────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6"
        style={{ mixBlendMode: "difference" }}
      >
        <span
          className="text-white text-base font-bold tracking-[0.25em] uppercase"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          KNETC
        </span>
        <Link
          href="/signup"
          aria-label="Sign up for knetc for free"
          className="text-white border border-white text-sm font-bold uppercase tracking-widest px-6 py-3 hover:bg-white hover:text-black transition-colors duration-200"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          Sign Up Free
        </Link>
      </motion.nav>

      {/* ── HERO ─────────────────────────────────────────────────────
          Full viewport height. Headline reveals word by word.
          Rule scaleX animates after headline lands.
      ──────────────────────────────────────────────────────────── */}
      <section
        className="min-h-screen flex flex-col justify-between px-8 pt-36 pb-14"
        aria-label="Hero"
      >
        {/* Eyebrow label */}
        <div className="overflow-hidden">
          <motion.p
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
            className="text-sm uppercase tracking-[0.3em]"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            AI Executive Team · Always On
          </motion.p>
        </div>

        {/* Headline — theatrical mask reveal */}
        <div>
          <HeroLine delay={0.4}>
            <h1 className="text-[clamp(4rem,12vw,11rem)] font-bold tracking-tight uppercase pb-2">
              Your
            </h1>
          </HeroLine>
          <HeroLine delay={0.58}>
            <h1 className="text-[clamp(4rem,12vw,11rem)] font-bold tracking-tight uppercase pb-2">
              Executive
            </h1>
          </HeroLine>
          <HeroLine delay={0.76}>
            <h1 className="text-[clamp(4rem,12vw,11rem)] font-bold tracking-tight uppercase">
              Team.
            </h1>
          </HeroLine>
        </div>

        {/* Rule + bottom row */}
        <div>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.1, delay: 1.0, ease: EASE }}
            className="h-px bg-white origin-left mb-10"
          />
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-8">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 1.15 }}
              className="text-lg leading-[1.9] max-w-sm"
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
                className="group inline-flex items-center gap-4 bg-white text-black px-10 py-5 text-base font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-300"
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

      {/* ── AGENT SHOWCASE ───────────────────────────────────────────
          3×2 grid. gap-px bg-white: parent exposes 1px white lines
          between black cells — clean dividers with no double borders.
          Hover: CSS fill wipe from bottom (no Framer needed).
      ──────────────────────────────────────────────────────────── */}
      <section className="border-t border-white px-8 py-28" aria-label="Meet the team">
        <ScrollReveal>
          <div className="flex items-baseline justify-between mb-16">
            <p
              className="text-sm uppercase tracking-[0.3em]"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              Meet The Team
            </p>
            <p
              className="text-sm text-white/40"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              6 agents
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-white border border-white">
          {AGENTS.map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.55, delay: i * 0.09, ease: EASE }}
              className="relative bg-black group overflow-hidden flex flex-col justify-between p-6 sm:p-10 min-h-[200px] sm:min-h-[300px]"
            >
              {/* Fill wipe from bottom on hover */}
              <div className="absolute inset-0 bg-white origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform duration-300 ease-out" />

              {/* Initial letter */}
              <span
                className="relative z-10 font-bold text-white group-hover:text-black transition-colors duration-200 select-none"
                style={{
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                  fontSize: "clamp(2.5rem, 6vw, 5rem)",
                  lineHeight: 1,
                }}
              >
                {agent.initial}
              </span>

              {/* Name + role — always legible */}
              <div className="relative z-10">
                <p
                  className="font-bold uppercase text-white group-hover:text-black transition-colors duration-200 leading-tight text-base sm:text-xl"
                >
                  {agent.name}
                </p>
                <p
                  className="text-white/50 group-hover:text-black/60 transition-colors duration-200 mt-1 text-sm sm:text-base"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {agent.role}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── VALUE PROPS ──────────────────────────────────────────────
          3-column grid with vertical dividers on desktop.
          Titles bump to text-3xl — these are section headlines.
          Body text at text-lg (18px) — comfortable reading.
      ──────────────────────────────────────────────────────────── */}
      <section className="border-t border-white py-28 px-8" aria-label="Why knetc">
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <ScrollReveal key={f.num} delay={i * 0.14}>
              <div
                className={[
                  "py-12 lg:py-0",
                  i > 0
                    ? "border-t border-white lg:border-t-0 lg:border-l lg:pl-12"
                    : "",
                  i < FEATURES.length - 1 ? "lg:pr-12" : "",
                ].join(" ")}
              >
                <p
                  className="text-sm mb-10"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {f.num}
                </p>
                <h2 className="text-3xl sm:text-4xl font-bold uppercase tracking-tight mb-8 leading-tight whitespace-pre-line">
                  {f.title}
                </h2>
                <p
                  className="text-lg leading-relaxed text-white/80"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {f.body}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ── THE BOARDROOM ─────────────────────────────────────────────
          Full white bg inversion — the scroll from black → white
          is its own design beat. Nav auto-inverts via mix-blend-mode.
      ──────────────────────────────────────────────────────────── */}
      <section className="bg-white text-black px-8 py-28" aria-label="The Boardroom">
        <div className="max-w-5xl">
          <ScrollReveal>
            <p
              className="text-sm uppercase tracking-[0.3em] mb-16"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              The Boardroom
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <h2 className="text-[clamp(3rem,8vw,7.5rem)] font-bold uppercase tracking-tight leading-none mb-12">
              All Six.
              <br />
              One Brief.
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <p
              className="text-xl leading-relaxed max-w-lg mb-16"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              Ask one question and every agent responds. Alex synthesises their
              answers into a single executive brief — and delivers it to your
              inbox. Your boardroom, on demand.
            </p>
          </ScrollReveal>

          {/* Agent name grid on white background */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border border-black mb-12">
            {AGENTS.map((agent, i) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.07, ease: EASE }}
                className="bg-white px-6 py-5"
              >
                <p
                  className="font-bold uppercase text-lg"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {agent.name}
                </p>
                <p
                  className="text-black/50 mt-1 text-base"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {agent.role}
                </p>
              </motion.div>
            ))}
          </div>

          <ScrollReveal delay={0.5}>
            <div className="border-t border-black pt-8 flex items-center gap-5">
              <div className="w-2.5 h-2.5 bg-black flex-shrink-0" />
              <p
                className="text-base uppercase tracking-widest"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                Synthesis delivered to your inbox in minutes
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────
          gap-px bg-white border border-white grid.
          Featured (Startup) card: bg-white text-black — inverted.
          Price numbers are unmissable: clamp(3rem,5vw,4.5rem).
      ──────────────────────────────────────────────────────────── */}
      <section className="border-t border-white py-28 px-8" aria-label="Pricing">
        <ScrollReveal>
          <p
            className="text-sm uppercase tracking-[0.3em] mb-16"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Pricing
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.08}>
          <h2 className="text-[clamp(2.5rem,7vw,6rem)] font-bold uppercase tracking-tight leading-none mb-20">
            One Team.
            <br />
            Three Plans.
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-white border border-white">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.8, delay: i * 0.1, ease: EASE }}
              className={[
                "flex flex-col p-10 h-full",
                plan.featured ? "bg-white text-black" : "bg-black text-white",
              ].join(" ")}
            >
              {/* Plan name + Most Popular badge */}
              <div className="flex items-start justify-between mb-8">
                <p
                  className="text-xl font-bold uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {plan.name}
                </p>
                {plan.featured && (
                  <span
                    className="text-xs font-bold uppercase tracking-widest bg-black text-white px-3 py-1.5 flex-shrink-0 ml-3"
                    style={{ fontFamily: "var(--font-space-mono), monospace" }}
                  >
                    Most Popular
                  </span>
                )}
              </div>

              {/* Price — unmissable */}
              <div className="mb-6 flex items-baseline gap-2">
                <span
                  className="font-bold leading-none"
                  style={{
                    fontSize: "clamp(3rem, 5vw, 4.5rem)",
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                  }}
                >
                  ${plan.price}
                </span>
                <span
                  className={[
                    "text-base",
                    plan.featured ? "text-black/50" : "text-white/50",
                  ].join(" ")}
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  /mo
                </span>
              </div>

              {/* Tagline */}
              <p
                className={[
                  "text-base leading-relaxed mb-10",
                  plan.featured ? "text-black/60" : "text-white/60",
                ].join(" ")}
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                {plan.tagline}
              </p>

              {/* Feature list */}
              <ul className="space-y-4 mb-12 flex-1">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-4">
                    <div
                      className={[
                        "w-2 h-2 mt-2 flex-shrink-0",
                        plan.featured ? "bg-black" : "bg-white",
                      ].join(" ")}
                    />
                    <span
                      className={[
                        "text-base leading-relaxed",
                        plan.featured ? "text-black/80" : "text-white/80",
                      ].join(" ")}
                      style={{ fontFamily: "var(--font-space-mono), monospace" }}
                    >
                      {feat}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href="/signup"
                aria-label={`Sign up for the ${plan.name} plan`}
                className={[
                  "block text-center py-4 text-sm font-bold uppercase tracking-widest border transition-colors duration-200",
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

      {/* ── CTA ───────────────────────────────────────────────────────
          Maximum scale. The headline and button command attention.
      ──────────────────────────────────────────────────────────── */}
      <section className="py-44 px-8 text-center" aria-label="Call to action">
        <ScrollReveal>
          <p
            className="text-sm uppercase tracking-[0.3em] mb-12"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Ready?
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <h2 className="text-[clamp(3rem,10vw,9rem)] font-bold uppercase tracking-tight leading-none mb-20">
            Meet Your
            <br />
            Team.
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.22}>
          <Link
            href="/signup"
            aria-label="Sign up for knetc for free"
            className="group inline-flex items-center gap-5 bg-white text-black px-14 py-7 text-base font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-300"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Sign Up Free
            <span className="inline-block group-hover:translate-x-2 transition-transform duration-300">
              →
            </span>
          </Link>
        </ScrollReveal>
        <ScrollReveal delay={0.34}>
          <p
            className="text-sm uppercase tracking-widest mt-12 opacity-50"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            No credit card required · Start in seconds
          </p>
        </ScrollReveal>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-white px-8 py-10 flex items-center justify-between">
        <span
          className="text-sm font-bold tracking-[0.25em] uppercase"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          KNETC
        </span>
        <span
          className="text-sm opacity-40"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          © {new Date().getFullYear()} knetc
        </span>
      </footer>
    </div>
  );
}
