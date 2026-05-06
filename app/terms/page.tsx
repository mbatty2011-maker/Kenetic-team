"use client";

import Link from "next/link";
import { Fragment } from "react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;
const FONT_GROTESK = "var(--font-space-grotesk), system-ui, sans-serif";
const FONT_MONO = "var(--font-space-mono), monospace";

type Block =
  | { type: "p"; text: string }
  | { type: "p-rich"; content: React.ReactNode }
  | { type: "p-emphasis"; text: string }
  | { type: "p-caps"; text: string }
  | { type: "p-lead"; lead: string; text: string }
  | { type: "ul"; items: string[] }
  | { type: "dl"; items: { term: string; desc: string }[] }
  | { type: "h3"; num: string; title: string }
  | { type: "kv"; rows: { label: string; value: React.ReactNode }[] }
  | { type: "table"; headers: string[]; rows: string[][] };

type Section = {
  num: string;
  title: string;
  blocks: Block[];
};

const INTRO =
  "These Terms of Service (“Terms”) constitute a legally binding agreement between you (“User,” “you,” or “your”) and Knetc LLC (“Knetc,” “we,” “us,” or “our”) governing your access to and use of Knetc.team and its AI executive agent platform (the “Service”). By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.";

const SECTIONS: Section[] = [
  {
    num: "01",
    title: "About the Service",
    blocks: [
      {
        type: "p",
        text: "Knetc.team provides AI-powered executive agents — Alex (Chief of Staff), Jeremy (CFO), Kai (CTO), Dana (Head of Sales), Maya (Head of Marketing), and Marcus (General Counsel) — to founders and small business operators. The Service enables users to interact with these agents through a conversational interface, connect third-party tools, store documents, and use the KnetcForge workflow builder.",
      },
      {
        type: "p",
        text: "The agents are powered by large language models. Their outputs are informational only. See Section 7 (AI Disclaimer) for critical limitations on reliance.",
      },
    ],
  },
  {
    num: "02",
    title: "Eligibility and Account Registration",
    blocks: [
      {
        type: "ul",
        items: [
          "You must be at least 18 years of age and capable of forming a legally binding contract under the laws of your jurisdiction to use the Service.",
          "You must be using the Service for business purposes on behalf of yourself or an entity you are authorized to bind. The Service is not intended for personal, household, or consumer use.",
          "You must provide accurate, current, and complete registration information and maintain it going forward.",
          "You are responsible for maintaining the confidentiality of your account credentials. You are liable for all activity that occurs under your account.",
          "You may not create an account on behalf of another person without authorization, or create multiple accounts to circumvent restrictions or bans.",
        ],
      },
    ],
  },
  {
    num: "03",
    title: "Subscriptions, Fees, and Billing",
    blocks: [
      { type: "h3", num: "3.1", title: "Subscription Tiers" },
      {
        type: "p",
        text: "The Service is offered on a subscription basis. Current tiers and pricing are displayed on knetc.team. Knetc reserves the right to modify pricing at any time with 30 days advance notice to existing subscribers.",
      },
      { type: "h3", num: "3.2", title: "Billing" },
      {
        type: "p",
        text: "All billing is processed by Stripe, Inc. on our behalf. By subscribing, you authorize Knetc to charge your payment method on a recurring basis at the applicable subscription rate. You must keep your billing information current.",
      },
      { type: "h3", num: "3.3", title: "Cancellation and Refunds" },
      {
        type: "ul",
        items: [
          "You may cancel your subscription at any time through your account settings.",
          "Cancellation takes effect at the end of the current billing period. You will retain access to the Service through that date.",
          "We do not provide refunds for partial subscription periods unless required by applicable law.",
          "Knetc reserves the right to issue refunds at its sole discretion in exceptional circumstances.",
        ],
      },
      { type: "h3", num: "3.4", title: "Free Tier" },
      {
        type: "p",
        text: "A free tier is available with limited functionality as described on the pricing page. Knetc may modify or discontinue the free tier at any time with reasonable notice.",
      },
    ],
  },
  {
    num: "04",
    title: "Third-Party Integrations",
    blocks: [
      {
        type: "p",
        text: "The Service allows you to connect third-party accounts to enhance agent functionality:",
      },
      {
        type: "table",
        headers: ["Integration", "Access Type", "Purpose"],
        rows: [
          [
            "Google (Gmail, Calendar, Drive)",
            "OAuth — read/write as authorized",
            "Enable agent access to emails, calendar, and documents",
          ],
          [
            "Stripe",
            "OAuth — read-only",
            "Enable CFO agent access to financial data",
          ],
          [
            "GitHub",
            "OAuth — read-only",
            "Enable CTO agent access to repositories and code",
          ],
        ],
      },
      {
        type: "ul",
        items: [
          "You authorize Knetc to access third-party data only as necessary to provide the features you use.",
          "You represent that you have the right to authorize these integrations.",
          "Knetc is not responsible for the availability, accuracy, or security of third-party platforms.",
          "You may revoke any integration at any time through your account settings or the third party’s platform.",
          "Third-party integrations are subject to those providers’ own terms of service.",
        ],
      },
    ],
  },
  {
    num: "05",
    title: "Your Data and Content",
    blocks: [
      { type: "h3", num: "5.1", title: "Ownership" },
      {
        type: "p",
        text: "You retain full ownership of all data, documents, and content you upload to or create through the Service (“User Content”). Knetc does not claim ownership of your User Content.",
      },
      { type: "h3", num: "5.2", title: "License to Knetc" },
      {
        type: "p",
        text: "By using the Service, you grant Knetc LLC a limited, non-exclusive, royalty-free license to access, store, process, and transmit your User Content solely to: (a) provide and operate the Service, (b) respond to your agent queries and execute tasks you initiate, (c) maintain backups and ensure Service reliability, and (d) comply with legal obligations. Knetc does not use your User Content to train artificial intelligence models, whether its own or third-party. This license terminates when you delete your account and your data is purged in accordance with Section 9.3.",
      },
      { type: "h3", num: "5.3", title: "Your Responsibilities" },
      {
        type: "p",
        text: "You are solely responsible for the accuracy, legality, and appropriateness of all User Content you submit. You represent and warrant that your User Content does not infringe any third-party intellectual property rights, violate any applicable law, or contain malicious code.",
      },
    ],
  },
  {
    num: "06",
    title: "Knetc Intellectual Property",
    blocks: [
      {
        type: "p",
        text: "Knetc LLC owns all rights, title, and interest in and to the Service, including the platform architecture, AI agent design and personas, KnetcForge workflow builder, branding, trademarks (including KnetcForge™), software, and all platform-generated outputs as products of the Service. These Terms do not grant you any rights in Knetc’s intellectual property except the limited right to use the Service as described herein.",
      },
    ],
  },
  {
    num: "07",
    title: "AI Agent Disclaimer — Important",
    blocks: [
      {
        type: "p-caps",
        text: "THE AI AGENTS ON KNETC.TEAM PROVIDE INFORMATIONAL OUTPUTS ONLY. THEIR OUTPUTS DO NOT CONSTITUTE PROFESSIONAL ADVICE OF ANY KIND, INCLUDING:",
      },
      {
        type: "ul",
        items: [
          "Legal advice, opinions, or representation (Marcus, General Counsel agent)",
          "Financial, accounting, tax, or investment advice (Jeremy, CFO agent)",
          "Technical or engineering advice (Kai, CTO agent)",
          "Sales, marketing, or business strategy advice (Dana, Maya, Alex agents)",
        ],
      },
      {
        type: "p-lead",
        lead: "No Attorney-Client Relationship.",
        text: "Marcus is an AI research and drafting assistant, not a lawyer and not a law firm. Use of Marcus does not create an attorney-client relationship between you and Knetc LLC, between you and any individual associated with Knetc LLC, or between you and Marcus. Communications with Marcus are not protected by attorney-client privilege or the work-product doctrine and may not be confidential. Documents, contracts, opinions, or other materials produced by Marcus are starting points for review by a licensed attorney — they are not finished legal work product.",
      },
      {
        type: "p-lead",
        lead: "No Fiduciary Relationship.",
        text: "Use of Jeremy, the CFO agent, does not create a fiduciary, accountant-client, or advisor-client relationship. Jeremy is not a Certified Public Accountant, Certified Financial Planner, registered investment advisor, or licensed financial professional.",
      },
      {
        type: "p-lead",
        lead: "Required Professional Review.",
        text: "Agent outputs are generated by AI and may be incomplete, inaccurate, biased, or not applicable to your specific situation. YOU MUST CONSULT A LICENSED PROFESSIONAL (attorney, accountant, financial advisor, or other relevant licensed expert) BEFORE MAKING ANY DECISION OR TAKING ANY ACTION BASED ON AGENT OUTPUTS. Knetc LLC expressly disclaims all liability for losses, damages, penalties, or adverse outcomes arising from reliance on agent outputs without independent professional verification.",
      },
    ],
  },
  {
    num: "08",
    title: "Acceptable Use and Prohibited Conduct",
    blocks: [
      { type: "p", text: "You agree not to use the Service to:" },
      {
        type: "ul",
        items: [
          "Violate any applicable local, state, federal, or international law or regulation.",
          "Upload, transmit, or generate content that is unlawful, defamatory, obscene, or harassing.",
          "Infringe the intellectual property rights of any third party.",
          "Reverse-engineer, decompile, or attempt to extract the source code of the Service.",
          "Scrape, crawl, or systematically extract data from the Service.",
          "Circumvent, disable, or interfere with security controls or access restrictions.",
          "Use the Service to develop a competing product or service.",
          "Upload malicious code, viruses, or other harmful software.",
          "Impersonate another person or entity.",
          "Use the Service for unauthorized high-volume automated requests.",
        ],
      },
      {
        type: "p",
        text: "Knetc reserves the right to investigate suspected violations and suspend or terminate accounts accordingly.",
      },
    ],
  },
  {
    num: "09",
    title: "Suspension and Termination",
    blocks: [
      { type: "h3", num: "9.1", title: "Termination by You" },
      {
        type: "p",
        text: "You may terminate your account at any time through account settings or by contacting support@knetc.team. Termination does not entitle you to a refund of prepaid subscription fees.",
      },
      { type: "h3", num: "9.2", title: "Termination by Knetc" },
      {
        type: "p",
        text: "Knetc may suspend or terminate your account immediately for violation of these Terms, non-payment of fees, or conduct that harms the Service or other users. For non-violation terminations (e.g., business changes), Knetc will provide 30 days advance notice and a pro-rata refund of prepaid fees.",
      },
      { type: "h3", num: "9.3", title: "Effect of Termination" },
      {
        type: "p",
        text: "Upon termination: (a) your right to access the Service ceases immediately; (b) you may request an export of your data within 30 days of termination; (c) Knetc will delete your data within 30 days after the export window closes; (d) Knetc will revoke and delete all OAuth tokens (Google, Stripe, GitHub, and any other authorized integrations) within 7 days of termination; (e) Sections 6, 7, 10, 11, 12, 13, and 14 survive termination.",
      },
    ],
  },
  {
    num: "10",
    title: "Disclaimers of Warranty",
    blocks: [
      {
        type: "p-caps",
        text: "THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. KNETC LLC EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING:",
      },
      {
        type: "ul",
        items: [
          "WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.",
          "WARRANTIES OF UNINTERRUPTED, ERROR-FREE, OR SECURE OPERATION.",
          "WARRANTIES REGARDING THE ACCURACY, COMPLETENESS, OR RELIABILITY OF AI AGENT OUTPUTS.",
          "WARRANTIES THAT THE SERVICE WILL MEET YOUR SPECIFIC BUSINESS REQUIREMENTS.",
        ],
      },
    ],
  },
  {
    num: "11",
    title: "Limitation of Liability",
    blocks: [
      {
        type: "p-caps",
        text: "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:",
      },
      {
        type: "ul",
        items: [
          "KNETC LLC’S TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE IS LIMITED TO THE GREATER OF (A) $100 USD OR (B) THE TOTAL FEES YOU PAID TO KNETC IN THE THREE (3) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM.",
          "KNETC LLC IS NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOSS OF DATA, BUSINESS INTERRUPTION, OR REPUTATIONAL HARM, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.",
        ],
      },
      {
        type: "p",
        text: "Some jurisdictions do not allow the exclusion of certain warranties or limitation of liability. In such jurisdictions, the above limitations apply to the fullest extent permitted by law.",
      },
    ],
  },
  {
    num: "12",
    title: "Indemnification",
    blocks: [
      {
        type: "p",
        text: "You agree to indemnify, defend, and hold harmless Knetc LLC and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including reasonable attorneys’ fees) arising out of or related to: (a) your use of the Service; (b) your User Content; (c) your third-party integration authorizations; (d) your violation of these Terms; or (e) your violation of any third-party right, including intellectual property rights.",
      },
    ],
  },
  {
    num: "13",
    title: "Privacy",
    blocks: [
      {
        type: "p-rich",
        content: (
          <>
            Your use of the Service is also governed by our{" "}
            <Link
              href="/privacy"
              className="underline-offset-4 hover:underline font-bold"
            >
              Privacy Policy
            </Link>
            , available at knetc.team, which is incorporated into these Terms by
            reference. By using the Service, you agree to the collection, use,
            and sharing of your information as described in the Privacy Policy.
          </>
        ),
      },
    ],
  },
  {
    num: "14",
    title: "Dispute Resolution",
    blocks: [
      { type: "h3", num: "14.1", title: "Informal Resolution" },
      {
        type: "p",
        text: "Before initiating any formal dispute, you agree to contact Knetc at support@knetc.team and attempt to resolve the dispute informally for at least 30 days.",
      },
      { type: "h3", num: "14.2", title: "Binding Arbitration" },
      {
        type: "p",
        text: "If informal resolution fails, any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be resolved by binding arbitration administered by the American Arbitration Association (AAA) under its Commercial Arbitration Rules. The arbitration shall be conducted in Utah County, Utah. The arbitrator’s decision shall be final and binding.",
      },
      { type: "h3", num: "14.3", title: "Class Action Waiver" },
      {
        type: "p-caps",
        text: "YOU AND KNETC LLC EACH WAIVE THE RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT OR CLASS-WIDE ARBITRATION. ALL DISPUTES MUST BE BROUGHT IN AN INDIVIDUAL CAPACITY ONLY.",
      },
      { type: "h3", num: "14.4", title: "Small Claims Exception" },
      {
        type: "p",
        text: "Either party may bring an individual claim in small claims court in Utah County, Utah, if the claim qualifies under that court’s jurisdictional limits, as an alternative to arbitration.",
      },
    ],
  },
  {
    num: "15",
    title: "Governing Law and Venue",
    blocks: [
      {
        type: "p",
        text: "These Terms are governed by the laws of the State of Utah, USA, without regard to its conflict of law provisions. For any matter not subject to arbitration (including injunctive relief), you consent to the exclusive jurisdiction of the state and federal courts located in Utah County, Utah.",
      },
    ],
  },
  {
    num: "16",
    title: "Modifications to These Terms",
    blocks: [
      {
        type: "p",
        text: "Knetc may update these Terms from time to time. We will notify you of material changes by email (to the address on your account) or via a prominent in-app notice at least 14 days before the changes take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms. If you do not accept the updated Terms, you must stop using the Service and cancel your subscription before the effective date.",
      },
    ],
  },
  {
    num: "17",
    title: "General Provisions",
    blocks: [
      {
        type: "dl",
        items: [
          {
            term: "Entire Agreement",
            desc: "These Terms and the Privacy Policy constitute the entire agreement between you and Knetc with respect to the Service and supersede all prior agreements.",
          },
          {
            term: "Severability",
            desc: "If any provision of these Terms is found unenforceable, it will be modified to the minimum extent necessary to make it enforceable. All other provisions remain in full force.",
          },
          {
            term: "Waiver",
            desc: "Knetc’s failure to enforce any right or provision is not a waiver of that right.",
          },
          {
            term: "Assignment",
            desc: "You may not assign these Terms without Knetc’s prior written consent. Knetc may assign these Terms in connection with a merger, acquisition, or sale of assets.",
          },
          {
            term: "Force Majeure",
            desc: "Knetc is not liable for delays or failures caused by events outside our reasonable control, including natural disasters, government actions, or internet infrastructure failures.",
          },
          {
            term: "Notices",
            desc: "Notices to Knetc must be sent to support@knetc.team. Notices to you will be sent to your account email address.",
          },
        ],
      },
    ],
  },
  {
    num: "18",
    title: "Contact Information",
    blocks: [
      {
        type: "kv",
        rows: [
          {
            label: "Email",
            value: (
              <a
                href="mailto:support@knetc.team"
                className="underline-offset-4 hover:underline"
              >
                support@knetc.team
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
    case "p-rich":
      return (
        <p
          className="text-base sm:text-[17px] leading-[1.85] text-white/85"
          style={{ fontFamily: FONT_MONO }}
        >
          {block.content}
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
    case "p-caps":
      return (
        <p
          className="text-sm sm:text-[15px] leading-[1.7] font-bold border border-white/40 bg-white/5 px-6 py-5"
          style={{ fontFamily: FONT_MONO }}
        >
          {block.text}
        </p>
      );
    case "p-lead":
      return (
        <p
          className="text-base sm:text-[17px] leading-[1.85] text-white/85"
          style={{ fontFamily: FONT_MONO }}
        >
          <span className="font-bold text-white">{block.lead}</span>{" "}
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
    case "dl":
      return (
        <dl className="space-y-5">
          {block.items.map((item) => (
            <div key={item.term} className="flex items-start gap-4">
              <span className="w-1.5 h-1.5 mt-[10px] bg-white flex-shrink-0" />
              <p
                className="text-base sm:text-[17px] leading-[1.8] text-white/85"
                style={{ fontFamily: FONT_MONO }}
              >
                <span className="font-bold text-white">{item.term}:</span>{" "}
                {item.desc}
              </p>
            </div>
          ))}
        </dl>
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
    case "table":
      return (
        <div className="overflow-x-auto -mx-1 sm:mx-0">
          <table
            className="w-full border border-white text-sm"
            style={{ fontFamily: FONT_MONO }}
          >
            <thead>
              <tr className="border-b border-white">
                {block.headers.map((h) => (
                  <th
                    key={h}
                    className="text-left p-4 font-bold uppercase tracking-widest text-xs whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr
                  key={i}
                  className={i > 0 ? "border-t border-white/20" : ""}
                >
                  {row.map((cell, j) => (
                    <td key={j} className="p-4 align-top text-white/85">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default function TermsPage() {
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
      <section className="px-8 pt-36 pb-20" aria-label="Terms of Service">
        <div className="overflow-hidden mb-12">
          <motion.p
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
            className="text-sm uppercase tracking-[0.3em]"
            style={{ fontFamily: FONT_MONO }}
          >
            Legal · Terms
          </motion.p>
        </div>

        <div className="mb-14">
          <HeroLine delay={0.4}>
            <h1 className="text-[clamp(3rem,11vw,9rem)] font-bold tracking-tight uppercase pb-2">
              Terms Of
            </h1>
          </HeroLine>
          <HeroLine delay={0.58}>
            <h1 className="text-[clamp(3rem,11vw,9rem)] font-bold tracking-tight uppercase">
              Service.
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
            href="/privacy"
            className="group inline-flex items-center gap-3 text-sm font-bold uppercase tracking-widest border-b border-white/40 pb-1 hover:border-white transition-colors"
            style={{ fontFamily: FONT_MONO }}
          >
            Privacy Policy
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
