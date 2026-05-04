import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadAgentFile, sanitizeFilename } from "@/lib/files/upload";
import type { DocumentSection } from "@/lib/files/types";

export interface MarcusDocumentRow {
  id: string;
  user_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  parsed_text: string | null;
  parsed_text_preview: string | null;
  analysis: Record<string, unknown> | null;
  created_at: string;
}

export class MarcusDocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document ${documentId} not found or not owned by this user.`);
    this.name = "MarcusDocumentNotFoundError";
  }
}

export async function getMarcusDocument(
  supabase: SupabaseClient,
  userId: string,
  documentId: string
): Promise<MarcusDocumentRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_marcus_document", {
    p_document_id: documentId,
    p_user_id: userId,
  });
  if (error) throw new Error(`get_marcus_document failed: ${error.message}`);
  if (!data) throw new MarcusDocumentNotFoundError(documentId);
  return data as MarcusDocumentRow;
}

// ───────────────────────────────────────────────────────────────────────────
// analyze_document — structural summary
// ───────────────────────────────────────────────────────────────────────────

export async function analyzeDocumentForAgent(
  supabase: SupabaseClient,
  userId: string,
  documentId: string
): Promise<string> {
  const doc = await getMarcusDocument(supabase, userId, documentId);
  if (!doc.parsed_text) {
    return `TOOL_ERROR: Document ${documentId} has no parsed text. STOP.`;
  }
  const summary = inferStructuralSummary(doc.parsed_text);
  const header = [
    `Document: ${doc.original_filename}`,
    `Mime: ${doc.mime_type}`,
    `Size: ${Math.round(doc.size_bytes / 1024)} KB`,
    doc.page_count ? `Pages: ${doc.page_count}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    header,
    "",
    "## Structural summary",
    summary,
    "",
    "## Full extracted text",
    doc.parsed_text,
  ].join("\n");
}

function inferStructuralSummary(text: string): string {
  const lines = text.split(/\r?\n/);
  const sectionLines = lines.filter(
    (l) => /^(\s*)(\d+\.|[A-Z][A-Z \-]{3,})/.test(l) && l.trim().length < 120
  );
  const partyHits = Array.from(
    text.matchAll(
      /\b(?:between|by and between|by:|seller|buyer|provider|client|company|licensor|licensee|disclosing party|receiving party)\b[^\n]{0,120}/gi
    )
  )
    .slice(0, 8)
    .map((m) => m[0].trim());
  const dateHits = Array.from(
    text.matchAll(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g
    )
  )
    .slice(0, 8)
    .map((m) => m[0]);
  const out: string[] = [];
  out.push(`Approx section markers: ${sectionLines.length}`);
  if (partyHits.length)
    out.push(`Party indicators (first 8):\n  - ${partyHits.join("\n  - ")}`);
  if (dateHits.length) out.push(`Date strings found (first 8): ${dateHits.join(", ")}`);
  if (sectionLines.length === 0 && partyHits.length === 0 && dateHits.length === 0) {
    out.push("No obvious structural markers — likely a short or non-legal document.");
  }
  return out.join("\n");
}

// ───────────────────────────────────────────────────────────────────────────
// review_contract — risk-report scaffolding
// ───────────────────────────────────────────────────────────────────────────

const RISK_CATEGORIES = [
  "Document type",
  "Parties",
  "Effective date / term",
  "Renewal & termination",
  "Financial obligations / fees",
  "Payment terms",
  "Scope of services / deliverables",
  "IP ownership & work product",
  "Confidentiality",
  "Data handling & privacy",
  "Warranties",
  "Indemnification",
  "Limitation of liability",
  "Insurance",
  "Governing law & venue",
  "Dispute resolution (arbitration / forum)",
  "Assignment & change of control",
  "Force majeure",
  "Notice provisions",
  "Severability / entire agreement",
] as const;

export async function reviewContractForAgent(
  supabase: SupabaseClient,
  userId: string,
  documentId: string
): Promise<string> {
  const doc = await getMarcusDocument(supabase, userId, documentId);
  if (!doc.parsed_text) {
    return `TOOL_ERROR: Document ${documentId} has no parsed text. STOP.`;
  }
  const checklist = RISK_CATEGORIES.map(
    (c) => `- ${c}: [extract from text or mark "not addressed"]`
  ).join("\n");
  return [
    `Document: ${doc.original_filename} (${doc.mime_type}, ${doc.page_count ?? "?"} pages)`,
    "",
    "## Review instructions for Marcus",
    "Compose a structured risk report covering each category below.",
    "For each category: (1) quote the relevant clause inline, (2) state the risk in plain language, (3) rank exposure HIGH / MEDIUM / LOW, (4) propose a redline or negotiation move.",
    "After per-category coverage, write a TOP RISKS section (max 5 bullets, ordered by severity).",
    "End with the standard not-legal-advice disclaimer.",
    "",
    "## Categories to cover",
    checklist,
    "",
    "## Document text",
    doc.parsed_text,
  ].join("\n");
}

// ───────────────────────────────────────────────────────────────────────────
// draft_legal_document — scaffolded template + docx generation
// ───────────────────────────────────────────────────────────────────────────

export type LegalDocumentType =
  | "nda_mutual"
  | "nda_one_way"
  | "terms_of_service"
  | "marketplace_terms_of_service"
  | "privacy_policy"
  | "msa"
  | "founder_agreement"
  | "contractor_agreement"
  | "employment_offer_letter";

export interface DraftLegalDocumentOpts {
  documentType: LegalDocumentType;
  parties: { name: string; role?: string; address?: string }[];
  jurisdiction: string;
  keyTerms: Record<string, unknown>;
  format?: "docx" | "pdf";
  title?: string;
}

export interface DraftLegalDocumentResult {
  signedUrl: string;
  storagePath: string;
  sizeBytes: number;
  filename: string;
  scaffold: { sections: DocumentSection[] };
}

const DISCLAIMER =
  "This document was drafted by an AI assistant for the operator's convenience. " +
  "It is not legal advice and may not reflect the laws of the operator's jurisdiction or " +
  "their counterparty's jurisdiction. A licensed attorney must review and adapt it before " +
  "execution. By using it, the operator accepts that the AI assistant and its provider have " +
  "no liability for any consequence of its use.";

export function buildLegalDocumentScaffold(
  opts: DraftLegalDocumentOpts
): DocumentSection[] {
  const partyLine = opts.parties
    .map(
      (p) =>
        `${p.name}${p.role ? ` (${p.role})` : ""}${p.address ? ` — ${p.address}` : ""}`
    )
    .join("; ");
  const headerSections: DocumentSection[] = [
    {
      type: "paragraph",
      text: `Parties: ${partyLine || "[parties to be filled in]"}`,
    },
    { type: "paragraph", text: `Governing law: ${opts.jurisdiction}` },
    {
      type: "paragraph",
      text: `Effective date: ${new Date().toISOString().slice(0, 10)}`,
    },
  ];
  const trailerSections: DocumentSection[] = [
    { type: "heading", level: 2, text: "Disclaimer" },
    { type: "paragraph", text: DISCLAIMER, italic: true },
  ];
  const body = scaffoldByType(opts.documentType);
  return [...headerSections, ...body, ...trailerSections];
}

function scaffoldByType(t: LegalDocumentType): DocumentSection[] {
  switch (t) {
    case "nda_mutual":
    case "nda_one_way":
      return sectionList([
        "1. Definitions",
        "2. Confidential Information",
        "3. Permitted Use",
        "4. Exclusions",
        "5. Term & Survival",
        "6. Return or Destruction",
        "7. Remedies & Injunctive Relief",
        "8. Governing Law",
        "9. Miscellaneous",
      ]);
    case "terms_of_service":
      return sectionList([
        "1. Acceptance of Terms",
        "2. Account & Eligibility",
        "3. Acceptable Use",
        "4. Subscriptions, Fees & Refunds",
        "5. Intellectual Property",
        "6. User Content & License Grant",
        "7. Privacy",
        "8. Disclaimers",
        "9. Limitation of Liability",
        "10. Indemnification",
        "11. Termination",
        "12. Governing Law & Dispute Resolution",
        "13. Changes to These Terms",
        "14. Contact",
      ]);
    case "marketplace_terms_of_service":
      return sectionList([
        "1. Definitions (Operator, Seller, Buyer, Listing, Workflow)",
        "2. Operator Role & Limited Agency",
        "3. Seller Eligibility & Verification",
        "4. Listing Standards & Content Moderation",
        "5. Buyer Obligations & Acceptable Use",
        "6. Fees, Payouts & Tax",
        "7. IP Ownership of Workflows & License Grant to Buyers",
        "8. Operator's License to Host & Display Listings",
        "9. Take-Down Policy & DMCA Procedure",
        "10. Disputes Between Buyers and Sellers",
        "11. Refunds & Chargebacks",
        "12. Privacy & Data Processing Roles",
        "13. Indemnification by Sellers",
        "14. Operator Disclaimers",
        "15. Limitation of Operator Liability",
        "16. Termination & Account Suspension",
        "17. Governing Law, Venue & Class-Action Waiver",
        "18. Modifications",
        "19. Contact & Notices",
      ]);
    case "privacy_policy":
      return sectionList([
        "1. Information We Collect",
        "2. How We Use Information",
        "3. Legal Bases (GDPR)",
        "4. Sharing & Sub-Processors",
        "5. International Transfers",
        "6. Retention",
        "7. Your Rights (GDPR / CCPA)",
        "8. Cookies & Similar Technologies",
        "9. Children's Privacy",
        "10. Security",
        "11. Changes to This Policy",
        "12. Contact / DPO",
      ]);
    case "msa":
      return sectionList([
        "1. Definitions",
        "2. Statement of Work Procedure",
        "3. Fees & Invoicing",
        "4. Term & Termination",
        "5. Confidentiality",
        "6. IP Ownership & Licenses",
        "7. Warranties",
        "8. Indemnification",
        "9. Limitation of Liability",
        "10. Insurance",
        "11. Independent Contractors",
        "12. Assignment & Change of Control",
        "13. Governing Law & Disputes",
        "14. Notices",
        "15. Miscellaneous",
      ]);
    case "founder_agreement":
      return sectionList([
        "1. Equity Allocation",
        "2. Vesting Schedule & Cliff",
        "3. Roles & Decision Authority",
        "4. Compensation",
        "5. IP Assignment",
        "6. Confidentiality",
        "7. Non-Compete & Non-Solicit (jurisdiction-permitting)",
        "8. Departure & Buy-Out",
        "9. Dispute Resolution",
        "10. Governing Law",
      ]);
    case "contractor_agreement":
      return sectionList([
        "1. Services",
        "2. Term & Termination",
        "3. Compensation & Expenses",
        "4. Independent Contractor Status",
        "5. IP Assignment & Work Product",
        "6. Confidentiality",
        "7. Warranties & Indemnities",
        "8. Limitation of Liability",
        "9. Governing Law",
      ]);
    case "employment_offer_letter":
      return sectionList([
        "1. Position & Start Date",
        "2. Compensation & Benefits",
        "3. Equity Grant",
        "4. At-Will Status",
        "5. Confidentiality & IP Assignment",
        "6. Reference to Employee Handbook",
        "7. Acceptance",
      ]);
    default:
      return sectionList(["1. Recitals", "2. Operative Provisions", "3. Boilerplate"]);
  }
}

function sectionList(headings: string[]): DocumentSection[] {
  const out: DocumentSection[] = [];
  for (const h of headings) {
    out.push({ type: "heading", level: 2, text: h });
    out.push({
      type: "paragraph",
      text: `[Marcus: fill in based on key_terms and document_type. Reference parties, jurisdiction, and any user-supplied constraints. Cite statutory frameworks where relevant for ${h}.]`,
    });
  }
  return out;
}

export async function draftLegalDocumentForAgent(
  userId: string,
  opts: DraftLegalDocumentOpts
): Promise<DraftLegalDocumentResult> {
  const format = opts.format ?? "docx";
  const title =
    opts.title?.trim() || defaultTitleForType(opts.documentType, opts.parties);
  const sections = buildLegalDocumentScaffold(opts);

  let buffer: Buffer;
  let contentType: string;
  if (format === "docx") {
    const { generateDocx } = await import("@/lib/files/generators/docx");
    buffer = await generateDocx({ title, sections });
    contentType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else {
    const { generatePdf } = await import("@/lib/files/generators/pdf");
    buffer = await generatePdf({ title, sections });
    contentType = "application/pdf";
  }

  const filename = `${sanitizeFilename(title)}.${format}`;
  const { signedUrl, storagePath, sizeBytes } = await uploadAgentFile(
    userId,
    filename,
    buffer,
    contentType
  );

  return { signedUrl, storagePath, sizeBytes, filename, scaffold: { sections } };
}

function defaultTitleForType(
  t: LegalDocumentType,
  parties: { name: string }[]
): string {
  const partyTag = parties.map((p) => p.name).slice(0, 2).join(" & ") || "Draft";
  const map: Record<LegalDocumentType, string> = {
    nda_mutual: `Mutual NDA — ${partyTag}`,
    nda_one_way: `One-Way NDA — ${partyTag}`,
    terms_of_service: `Terms of Service — ${partyTag}`,
    marketplace_terms_of_service: `Marketplace Terms of Service — ${partyTag}`,
    privacy_policy: `Privacy Policy — ${partyTag}`,
    msa: `Master Services Agreement — ${partyTag}`,
    founder_agreement: `Founder Agreement — ${partyTag}`,
    contractor_agreement: `Contractor Agreement — ${partyTag}`,
    employment_offer_letter: `Offer Letter — ${partyTag}`,
  };
  return map[t];
}

// ───────────────────────────────────────────────────────────────────────────
// flag_legal_risks — free-form risk pass (no doc input)
// ───────────────────────────────────────────────────────────────────────────

export const RISK_AREAS = [
  "Contract & commercial",
  "Intellectual property",
  "Employment & contractor",
  "Privacy & data protection (GDPR / CCPA)",
  "Consumer protection",
  "Securities & fundraising",
  "Tax & licensing",
  "Regulatory (industry-specific)",
  "Anti-trust / competition",
  "Marketing & advertising claims",
  "Disputes & litigation exposure",
] as const;

export function flagLegalRisksScaffold(activityDescription: string): string {
  const checklist = RISK_AREAS.map((a) => `- ${a}: [analyze and rank H/M/L]`).join("\n");
  return [
    "## Activity / clause to analyze",
    activityDescription,
    "",
    "## Coverage instructions",
    "For each area below: identify the exposure, rank HIGH / MEDIUM / LOW, and propose a concrete mitigation.",
    "End with a TOP MITIGATIONS list (max 5 ranked actions) and the standard not-legal-advice disclaimer.",
    "",
    "## Areas",
    checklist,
  ].join("\n");
}
