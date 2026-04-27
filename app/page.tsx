"use client";

import Link from "next/link";
import { motion } from "framer-motion";

// Cubic bezier that feels snappy but organic — used everywhere
const EASE = [0.16, 1, 0.3, 1] as const;

const agents = [
  { name: "ALEX", role: "Chief of Staff" },
  { name: "JEREMY", role: "CFO" },
  { name: "KAI", role: "CTO" },
  { name: "DANA", role: "Head of Sales" },
  { name: "MARCUS", role: "General Counsel" },
];

const features = [
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

// Theatrical text reveal: parent clips, child rises from below the mask
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

// Fade + lift reveal triggered when the element enters the viewport
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
      {/* ── NAV ──────────────────────────────────────────────────
          mix-blend-mode: difference makes this nav automatically
          invert: white on black sections, black on the white team
          section — zero manual colour switching needed.
      ─────────────────────────────────────────────────────────── */}
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

      {/* ── HERO ─────────────────────────────────────────────────
          Full viewport. Massive headline reveals word by word.
          Horizontal rule animates scaleX from left after the
          headline lands. CTA + subtext appear last.
      ─────────────────────────────────────────────────────────── */}
      <section
        className="min-h-screen flex flex-col justify-between px-8 pt-32 pb-12"
        aria-label="Hero"
      >
        {/* Label */}
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

        {/* Headline */}
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

        {/* Rule + bottom row */}
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
              Available instantly, 24/7.
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

      {/* ── VALUE PROPS ──────────────────────────────────────────
          3-column grid. Vertical dividers on desktop,
          horizontal dividers on mobile. Numbered in mono.
          Each column staggers in as it enters view.
      ─────────────────────────────────────────────────────────── */}
      <section
        className="border-t border-white py-24 px-8"
        aria-label="Why knetc"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {features.map((f, i) => (
            <ScrollReveal key={f.num} delay={i * 0.12}>
              <div
                className={[
                  "py-10 lg:py-0",
                  i > 0
                    ? "border-t border-white lg:border-t-0 lg:border-l lg:pl-10"
                    : "",
                  i < features.length - 1 ? "lg:pr-10" : "",
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

      {/* ── TEAM ─────────────────────────────────────────────────
          Full colour inversion — white background, black text.
          The scroll from black → white is itself a design beat.
          Names are enormous; roles are monospaced, minimal.
      ─────────────────────────────────────────────────────────── */}
      <section className="bg-white text-black px-8 py-24" aria-label="The team">
        <ScrollReveal>
          <p
            className="text-xs uppercase tracking-[0.3em] mb-14"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            Your Team
          </p>
        </ScrollReveal>
        <div role="list">
          {agents.map((agent, i) => (
            <ScrollReveal key={agent.name} delay={i * 0.07}>
              <div
                role="listitem"
                className="flex items-center justify-between py-5 border-t border-black last:border-b"
              >
                <span className="text-[clamp(1.8rem,5.5vw,4.5rem)] font-bold uppercase tracking-tight leading-none">
                  {agent.name}
                </span>
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  {agent.role}
                </span>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────
          Back to black. Centred, maximal. The headline and
          button land with staggered scroll reveals so the
          section builds as the user arrives at it.
          Button inverts on hover — the defining interaction.
      ─────────────────────────────────────────────────────────── */}
      <section
        className="py-40 px-8 text-center"
        aria-label="Call to action"
      >
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

      {/* ── FOOTER ───────────────────────────────────────────── */}
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
