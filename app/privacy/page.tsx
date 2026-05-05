"use client";

import Link from "next/link";
import { Fragment } from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;
const FONT_GROTESK = "var(--font-space-grotesk), system-ui, sans-serif";
const FONT_MONO = "var(--font-space-mono), monospace";

type Block =
  | { type: "p"; text: string }
  | { type: "p-emphasis"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "h3"; num: string; title: string }
  | { type: "kv"; rows: { label: string; value: React.ReactNode }[] };

type Section = {
  num: string;
  title: string;
  blocks: Block[];
};

const INTRO =
  "This Privacy Policy explains how Knetc LLC (“Knetc,” “we,” “us,” or “our”) collects, uses, stores, shares, and protects information about you when you use Knetc.team and its associated services (the “Service”). By using the Service, you agree to the practices described in this Policy.";

const SECTIONS: Section[] = [
  {
    num: "01",
    title: "Who We Are",
    blocks: [
      {
        type: "p",
        text: "Knetc LLC is a limited liability company organized under the laws of the State of Utah, with its principal place of business at 1988 West 1150 North, Lehi, UT 84043. For privacy-related inquiries, contact us at mbatty2011@gmail.com.",
      },
    ],
  },
  {
    num: "02",
    title: "Information We Collect",
    blocks: [
      {
        type: "p",
        text: "We collect information in three ways: information you provide directly, information collected automatically, and information from third-party integrations you authorize.",
      },
      { type: "h3", num: "2.1", title: "Information You Provide" },
      {
        type: "ul",
        items: [
          "Account registration data: name, email address, company name, and role.",
          "Billing information: processed by Stripe on our behalf. We do not store full payment card numbers.",
          "Conversation history: all messages you send to and receive from AI agents (Alex, Jeremy, Kai, Dana, Maya, Marcus).",
          "User-uploaded documents: files, PDFs, spreadsheets, and other documents you upload to the Service.",
          "Support communications: emails, chat messages, or other communications you send to us.",
        ],
      },
      { type: "h3", num: "2.2", title: "Information Collected Automatically" },
      {
        type: "ul",
        items: [
          "Usage logs: pages visited, features used, agent sessions initiated, timestamps, and clickstream data.",
          "Device and browser data: IP address, browser type, operating system, and device identifiers.",
          "Session and authentication tokens: used to keep you logged in and secure your account.",
          "Analytics data: aggregated usage patterns used to improve the Service.",
        ],
      },
      {
        type: "h3",
        num: "2.3",
        title: "Information from Third-Party Integrations (User-Authorized)",
      },
      {
        type: "p",
        text: "When you connect third-party accounts, we access data only as authorized by you through OAuth:",
      },
      {
        type: "ul",
        items: [
          "Google (Gmail, Google Calendar, Google Drive): email messages, calendar events, and Drive files as authorized by you, to enable AI agent tasks you request.",
          "Stripe (read-only): financial account and transaction data to enable CFO-related agent tasks. We do not initiate payments or modify your Stripe account.",
          "GitHub (read-only): repository contents, commit history, and code files to enable CTO-related agent tasks. We do not modify your GitHub repositories.",
        ],
      },
      {
        type: "p",
        text: "You may revoke any third-party integration at any time through your account settings or through the third-party provider’s OAuth management page.",
      },
    ],
  },
  {
    num: "03",
    title: "How We Use Your Information",
    blocks: [
      {
        type: "ul",
        items: [
          "Provide, operate, and improve the Service and its AI agents.",
          "Process and transmit your conversation inputs to Anthropic (our AI inference provider) to generate agent responses.",
          "Store conversation history and uploaded documents in your personal workspace.",
          "Authenticate your identity and maintain account security.",
          "Process billing and subscription management through Stripe.",
          "Send you service-related notifications and policy updates.",
          "Analyze aggregated usage patterns to improve agent quality.",
          "Respond to your support requests.",
          "Comply with applicable law and legal obligations.",
        ],
      },
      {
        type: "p-emphasis",
        text: "We do not sell your personal information. We do not use your data for third-party advertising.",
      },
    ],
  },
  {
    num: "04",
    title: "AI Processing and Inference",
    blocks: [
      {
        type: "p",
        text: "The AI agents on Knetc.team are powered by large language models provided by Anthropic, Inc. When you send a message to an agent, the content of that message (and relevant context from your conversation history) is transmitted to Anthropic’s API for inference. By using the Service, you acknowledge and consent to this transmission.",
      },
      {
        type: "p",
        text: "Knetc LLC does not train its own models on your data. Your conversation data is sent to Anthropic via its API. Per Anthropic’s API terms, API inputs are not used to train Anthropic’s models by default. For full details, see Anthropic’s usage policies at anthropic.com.",
      },
    ],
  },
  {
    num: "05",
    title: "Data Storage and Security",
    blocks: [
      {
        type: "p",
        text: "Your data is stored using Supabase, a managed database and file storage provider. Security measures include:",
      },
      {
        type: "ul",
        items: [
          "Encryption in transit: all data transmitted between your browser and our servers uses TLS encryption.",
          "Encryption at rest: data stored in Supabase is encrypted at rest.",
          "Row-level security: database access controls enforced at the row level.",
          "Authentication: accounts protected by email/password authentication.",
          "OAuth tokens: tokens from Google, Stripe, and GitHub are stored encrypted (AES-256-GCM) and scoped to authorized access levels.",
        ],
      },
    ],
  },
  {
    num: "06",
    title: "Data Retention",
    blocks: [
      {
        type: "p",
        text: "We retain your data for as long as your account is active. Upon account deletion, your conversation history and uploaded documents are deleted within 30 days, and OAuth tokens are revoked and deleted within 7 days. Billing and tax records are retained for seven (7) years as required by IRS regulations and applicable state law. To request deletion, contact mbatty2011@gmail.com or use account settings.",
      },
    ],
  },
  {
    num: "07",
    title: "Data Sharing and Disclosure",
    blocks: [
      {
        type: "p",
        text: "We share your information only with: (a) service providers (Anthropic, Supabase, Stripe) bound by data processing agreements; (b) when required by law or valid legal process; (c) in connection with a business transfer, with notice to you; and (d) with your explicit consent. We do not sell, rent, or trade your personal information.",
      },
    ],
  },
  {
    num: "08",
    title: "Your Rights and Choices",
    blocks: [
      {
        type: "ul",
        items: [
          "Access: request a copy of the personal data we hold about you.",
          "Correction: request correction of inaccurate or incomplete data.",
          "Deletion: request deletion of your account and associated data.",
          "Data portability: request an export of your conversation history and uploaded documents.",
          "Revoke integrations: disconnect Google, Stripe, or GitHub at any time.",
          "Opt out: unsubscribe from non-essential emails at any time.",
        ],
      },
      {
        type: "p",
        text: "To exercise any right, contact mbatty2011@gmail.com. We will respond within 30 days.",
      },
    ],
  },
  {
    num: "09",
    title: "California Privacy Rights (CCPA/CPRA)",
    blocks: [
      {
        type: "p",
        text: "California residents have the right to know, delete, correct, and opt out of the sale of personal information. We do not sell personal information. To submit a CCPA request, contact mbatty2011@gmail.com.",
      },
    ],
  },
  {
    num: "10",
    title: "Age Restriction",
    blocks: [
      {
        type: "p",
        text: "The Service is intended only for users who are at least 18 years of age. The Service is not directed to children, and we do not knowingly collect personal information from anyone under 18. If you believe we have collected information from a person under 18, contact mbatty2011@gmail.com immediately and we will promptly delete it.",
      },
    ],
  },
  {
    num: "11",
    title: "Cookies and Tracking",
    blocks: [
      {
        type: "p",
        text: "We use essential cookies (for authentication and session management), analytics cookies (aggregated, anonymized), and preference cookies. We do not use third-party advertising or behavioral tracking cookies.",
      },
    ],
  },
  {
    num: "12",
    title: "Governing Law",
    blocks: [
      {
        type: "p",
        text: "This Privacy Policy is governed by the laws of the State of Utah, USA.",
      },
    ],
  },
  {
    num: "13",
    title: "Changes to This Policy",
    blocks: [
      {
        type: "p",
        text: "We will notify you of material changes by email or in-app notice at least 14 days before changes take effect. Continued use after the effective date constitutes acceptance.",
      },
    ],
  },
  {
    num: "14",
    title: "Contact Us",
    blocks: [
      {
        type: "kv",
        rows: [
          {
            label: "Email",
            value: (
              <a
                href="mailto:mbatty2011@gmail.com"
                className="underline-offset-4 hover:underline"
              >
                mbatty2011@gmail.com
              </a>
            ),
          },
          {
            label: "Mail",
            value: "Knetc LLC, 1988 West 1150 North, Lehi, UT 84043",
          },
          {
            label: "Web",
            value: (
              <a
                href="https://knetc.team"
                className="underline-offset-4 hover:underline"
              >
                knetc.team
              </a>
            ),
          },
        ],
      },
    ],
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

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p
          className="text-base sm:text-[17px] leading-[1.85] text-white/85"
          style={{ fontFamily: FONT_MONO }}
        >
          {block.text}
        </p>
      );
    case "p-emphasis":
      return (
        <p
          className="text-base sm:text-[17px] leading-[1.85] border-l-2 border-white pl-6 py-1 font-bold uppercase tracking-wide"
          style={{ fontFamily: FONT_MONO }}
        >
          {block.text}
        </p>
      );
    case "ul":
      return (
        <ul className="space-y-4">
          {block.items.map((item) => (
            <li key={item} className="flex items-start gap-4">
              <span className="w-1.5 h-1.5 mt-[10px] bg-white flex-shrink-0" />
              <span
                className="text-base sm:text-[17px] leading-[1.8] text-white/85"
                style={{ fontFamily: FONT_MONO }}
              >
                {item}
              </span>
            </li>
          ))}
        </ul>
      );
    case "h3":
      return (
        <div className="flex items-baseline gap-4">
          <span
            className="text-xs text-white/40"
            style={{ fontFamily: FONT_MONO }}
          >
            {block.num}
          </span>
          <h3
            className="text-base sm:text-lg font-bold uppercase tracking-[0.18em]"
            style={{ fontFamily: FONT_MONO }}
          >
            {block.title}
          </h3>
        </div>
      );
    case "kv":
      return (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-4">
          {block.rows.map((row, i) => (
            <Fragment key={i}>
              <dt
                className="text-xs uppercase tracking-[0.25em] text-white/40 pt-1"
                style={{ fontFamily: FONT_MONO }}
              >
                {row.label}
              </dt>
              <dd
                className="text-base sm:text-[17px] leading-[1.8]"
                style={{ fontFamily: FONT_MONO }}
              >
                {row.value}
              </dd>
            </Fragment>
          ))}
        </dl>
      );
  }
}

export default function PrivacyPage() {
  return (
    <div
      className="bg-black text-white min-h-screen selection:bg-white selection:text-black"
      style={{ fontFamily: FONT_GROTESK }}
    >
      {/* NAV */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6"
        style={{ mixBlendMode: "difference" }}
      >
        <Link
          href="/"
          aria-label="Knetc home"
          className="text-white text-base font-bold tracking-[0.25em] uppercase"
          style={{ fontFamily: FONT_MONO }}
        >
          KNETC
        </Link>
        <Link
          href="/signup"
          aria-label="Sign up for knetc for free"
          className="text-white border border-white text-sm font-bold uppercase tracking-widest px-6 py-3 hover:bg-white hover:text-black transition-colors duration-200"
          style={{ fontFamily: FONT_MONO }}
        >
          Sign Up Free
        </Link>
      </motion.nav>

      {/* HERO */}
      <section className="px-8 pt-36 pb-20" aria-label="Privacy Policy">
        <div className="overflow-hidden mb-12">
          <motion.p
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
            className="text-sm uppercase tracking-[0.3em]"
            style={{ fontFamily: FONT_MONO }}
          >
            Legal · Privacy
          </motion.p>
        </div>

        <div className="mb-14">
          <HeroLine delay={0.4}>
            <h1 className="text-[clamp(3rem,11vw,9rem)] font-bold tracking-tight uppercase pb-2">
              Privacy
            </h1>
          </HeroLine>
          <HeroLine delay={0.58}>
            <h1 className="text-[clamp(3rem,11vw,9rem)] font-bold tracking-tight uppercase">
              Policy.
            </h1>
          </HeroLine>
        </div>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.1, delay: 0.85, ease: EASE }}
          className="h-px bg-white origin-left mb-12"
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 1.0 }}
          className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-8 mb-14 text-xs uppercase tracking-[0.25em] text-white/50"
          style={{ fontFamily: FONT_MONO }}
        >
          <span>Knetc LLC</span>
          <span className="hidden sm:inline text-white/30">·</span>
          <span>Effective May 5, 2026</span>
          <span className="hidden sm:inline text-white/30">·</span>
          <span>Last Updated May 5, 2026</span>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.15, ease: EASE }}
          className="max-w-3xl text-base sm:text-[17px] leading-[1.9] text-white/85"
          style={{ fontFamily: FONT_MONO }}
        >
          {INTRO}
        </motion.p>
      </section>

      {/* SECTIONS */}
      <div className="border-t border-white">
        {SECTIONS.map((section) => (
          <section
            key={section.num}
            className="border-b border-white/15 px-8 py-16 sm:py-20"
            aria-label={section.title}
          >
            <div className="max-w-3xl">
              <p
                className="text-sm text-white/40 mb-6"
                style={{ fontFamily: FONT_MONO }}
              >
                {section.num}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-tight mb-10 leading-tight">
                {section.title}
              </h2>
              <div className="space-y-8">
                {section.blocks.map((block, i) => (
                  <BlockRenderer key={i} block={block} />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* SECONDARY LINKS */}
      <section className="border-t border-white px-8 py-16">
        <div className="max-w-3xl flex flex-col sm:flex-row gap-6 sm:gap-10 items-start">
          <Link
            href="/terms"
            className="group inline-flex items-center gap-3 text-sm font-bold uppercase tracking-widest border-b border-white/40 pb-1 hover:border-white transition-colors"
            style={{ fontFamily: FONT_MONO }}
          >
            Terms of Service
            <span className="inline-block group-hover:translate-x-1 transition-transform duration-200">
              →
            </span>
          </Link>
          <Link
            href="/"
            className="group inline-flex items-center gap-3 text-sm font-bold uppercase tracking-widest border-b border-white/40 pb-1 hover:border-white transition-colors"
            style={{ fontFamily: FONT_MONO }}
          >
            Back to Home
            <span className="inline-block group-hover:translate-x-1 transition-transform duration-200">
              →
            </span>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white px-8 py-10 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-bold tracking-[0.25em] uppercase"
          style={{ fontFamily: FONT_MONO }}
        >
          KNETC
        </Link>
        <span
          className="text-sm opacity-40"
          style={{ fontFamily: FONT_MONO }}
        >
          © {new Date().getFullYear()} knetc
        </span>
      </footer>
    </div>
  );
}
