import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContactStatus = "active" | "cold" | "do_not_contact" | "customer";

export type DealStage =
  | "new"
  | "qualified"
  | "meeting"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export type DealRole =
  | "champion"
  | "decision_maker"
  | "procurement"
  | "technical"
  | "user"
  | "other";

export type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "linkedin"
  | "task";

export type Contact = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  notes: string | null;
  source: string | null;
  status: ContactStatus;
  tags: string[];
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Deal = {
  id: string;
  user_id: string;
  contact_id: string | null;
  title: string;
  company: string | null;
  value_minor: number;
  currency: string;
  stage: DealStage;
  probability: number;
  expected_close_date: string | null;
  notes: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DealStakeholder = {
  contact_id: string;
  role: DealRole;
  full_name: string;
  email: string | null;
  title: string | null;
  company: string | null;
};

export type Activity = {
  id: string;
  user_id: string;
  contact_id: string | null;
  deal_id: string | null;
  activity_type: ActivityType;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  metadata: Record<string, unknown>;
  idempotency_key: string | null;
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEAL_STAGES: DealStage[] = [
  "new", "qualified", "meeting", "proposal", "negotiation", "won", "lost",
];

const STAGE_ORDER: Record<DealStage, number> = {
  new: 0, qualified: 1, meeting: 2, proposal: 3, negotiation: 4, won: 5, lost: 6,
};

const ACTIVITY_TYPES: ActivityType[] = [
  "call", "email", "meeting", "note", "linkedin", "task",
];

const DEAL_ROLES: DealRole[] = [
  "champion", "decision_maker", "procurement", "technical", "user", "other",
];

const CONTACT_STATUSES: ContactStatus[] = [
  "active", "cold", "do_not_contact", "customer",
];

// ─── Money helpers ────────────────────────────────────────────────────────────

function formatMoneyMinor(amountMinor: number, currency: string): string {
  const code = (currency || "usd").toUpperCase();
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${code} ${major.toFixed(0)}`;
  }
}

export function dollarsToMinor(amount: number | string | undefined | null): number {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function looksLikeEmail(v: unknown): v is string {
  return typeof v === "string" && /.+@.+\..+/.test(v.trim());
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function ensureStage(v: unknown): DealStage {
  if (typeof v === "string" && DEAL_STAGES.includes(v as DealStage)) return v as DealStage;
  return "new";
}

function ensureStatus(v: unknown): ContactStatus {
  if (typeof v === "string" && CONTACT_STATUSES.includes(v as ContactStatus)) {
    return v as ContactStatus;
  }
  return "active";
}

function ensureRole(v: unknown): DealRole {
  if (typeof v === "string" && DEAL_ROLES.includes(v as DealRole)) return v as DealRole;
  return "other";
}

function ensureActivityType(v: unknown): ActivityType {
  if (typeof v === "string" && ACTIVITY_TYPES.includes(v as ActivityType)) {
    return v as ActivityType;
  }
  return "note";
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export type AddContactInput = {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
  source?: string | null;
  status?: ContactStatus;
  tags?: string[];
};

export async function addContact(
  supabase: SupabaseClient,
  userId: string,
  input: AddContactInput
): Promise<{ contact: Contact; created: boolean }> {
  const fullName = input.full_name?.trim();
  if (!fullName) throw new Error("full_name is required");

  const email = input.email?.trim() || null;
  const payload = {
    user_id: userId,
    full_name: fullName,
    email,
    phone: input.phone?.trim() || null,
    title: input.title?.trim() || null,
    company: input.company?.trim() || null,
    linkedin_url: input.linkedin_url?.trim() || null,
    notes: input.notes?.trim() || null,
    source: input.source?.trim() || null,
    status: ensureStatus(input.status),
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === "string") : [],
  };

  if (email) {
    const existing = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("user_id", userId)
      .eq("email_lower", email.toLowerCase())
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    if (existing.data) {
      const merge: Record<string, unknown> = {};
      const before = existing.data as Contact;
      // Update only fields the caller supplied (don't blow away existing data).
      if (input.full_name !== undefined) merge.full_name = fullName;
      if (input.phone !== undefined) merge.phone = payload.phone;
      if (input.title !== undefined) merge.title = payload.title;
      if (input.company !== undefined) merge.company = payload.company;
      if (input.linkedin_url !== undefined) merge.linkedin_url = payload.linkedin_url;
      if (input.notes !== undefined) merge.notes = payload.notes;
      if (input.source !== undefined) merge.source = payload.source;
      if (input.status !== undefined) merge.status = payload.status;
      if (input.tags !== undefined) merge.tags = payload.tags;

      if (Object.keys(merge).length === 0) {
        return { contact: before, created: false };
      }

      const updated = await supabase
        .from("crm_contacts")
        .update(merge)
        .eq("id", before.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (updated.error) throw new Error(updated.error.message);
      return { contact: updated.data as Contact, created: false };
    }
  }

  const inserted = await supabase
    .from("crm_contacts")
    .insert(payload)
    .select()
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return { contact: inserted.data as Contact, created: true };
}

export async function findContactByEmail(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<Contact | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from("crm_contacts")
    .select("*")
    .eq("user_id", userId)
    .eq("email_lower", trimmed)
    .maybeSingle();
  if (error) return null;
  return (data as Contact | null) ?? null;
}

export async function getContactByIdOrEmail(
  supabase: SupabaseClient,
  userId: string,
  idOrEmail: string
): Promise<{ contact: Contact; deals: Deal[]; activities: Activity[] } | null> {
  const trimmed = idOrEmail.trim();
  if (!trimmed) return null;

  let contact: Contact | null = null;
  if (isUuid(trimmed)) {
    const { data, error } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("user_id", userId)
      .eq("id", trimmed)
      .maybeSingle();
    if (error) throw new Error(error.message);
    contact = (data as Contact | null) ?? null;
  } else if (looksLikeEmail(trimmed)) {
    contact = await findContactByEmail(supabase, userId, trimmed);
  } else {
    // Try case-insensitive name match as a last resort, take the most recent.
    const { data, error } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("user_id", userId)
      .ilike("full_name", trimmed)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    contact = (data?.[0] as Contact | undefined) ?? null;
  }

  if (!contact) return null;

  const [primaryDealsRes, joinDealsRes, activitiesRes] = await Promise.all([
    supabase
      .from("crm_deals")
      .select("*")
      .eq("user_id", userId)
      .eq("contact_id", contact.id)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("crm_deal_contacts")
      .select("deal_id, crm_deals(*)")
      .eq("contact_id", contact.id),
    supabase
      .from("crm_activities")
      .select("*")
      .eq("user_id", userId)
      .eq("contact_id", contact.id)
      .order("occurred_at", { ascending: false })
      .limit(10),
  ]);

  if (primaryDealsRes.error) throw new Error(primaryDealsRes.error.message);
  if (activitiesRes.error) throw new Error(activitiesRes.error.message);

  const dealsById = new Map<string, Deal>();
  for (const d of (primaryDealsRes.data ?? []) as Deal[]) dealsById.set(d.id, d);
  if (!joinDealsRes.error && joinDealsRes.data) {
    const joinRows = joinDealsRes.data as unknown as { crm_deals: Deal | null }[];
    for (const row of joinRows) {
      if (row.crm_deals && !dealsById.has(row.crm_deals.id)) {
        if (row.crm_deals.user_id === userId) dealsById.set(row.crm_deals.id, row.crm_deals);
      }
    }
  }
  const deals = Array.from(dealsById.values()).sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : -1
  );

  return {
    contact,
    deals,
    activities: (activitiesRes.data ?? []) as Activity[],
  };
}

export type ListContactsFilters = {
  company?: string;
  status?: ContactStatus;
  tag?: string;
  recently_contacted_days?: number;
  query?: string;
  limit?: number;
  offset?: number;
};

export async function listContacts(
  supabase: SupabaseClient,
  userId: string,
  filters: ListContactsFilters
): Promise<{ contacts: Contact[]; total: number }> {
  const limit = clamp(filters.limit ?? 25, 1, 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  let q = supabase
    .from("crm_contacts")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (filters.company) {
    q = q.ilike("company", `%${filters.company.trim()}%`);
  }
  if (filters.status) {
    q = q.eq("status", filters.status);
  }
  if (filters.tag) {
    q = q.contains("tags", [filters.tag]);
  }
  if (filters.recently_contacted_days && filters.recently_contacted_days > 0) {
    const cutoff = new Date(Date.now() - filters.recently_contacted_days * 86400_000).toISOString();
    q = q.gte("last_contacted_at", cutoff);
  }
  if (filters.query) {
    const term = filters.query.trim();
    if (term) {
      q = q.or(
        `full_name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%`
      );
    }
  }

  q = q.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { contacts: (data ?? []) as Contact[], total: count ?? 0 };
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export type CreateDealInput = {
  title: string;
  primary_contact_id?: string;
  additional_contacts?: { contact_id: string; role?: DealRole }[];
  company?: string;
  value_minor?: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  expected_close_date?: string;
  notes?: string;
};

export async function createDeal(
  supabase: SupabaseClient,
  userId: string,
  input: CreateDealInput
): Promise<Deal> {
  const title = input.title?.trim();
  if (!title) throw new Error("title is required");

  if (input.primary_contact_id && !isUuid(input.primary_contact_id)) {
    throw new Error("primary_contact_id must be a UUID");
  }

  const payload = {
    user_id: userId,
    title,
    contact_id: input.primary_contact_id ?? null,
    company: input.company?.trim() || null,
    value_minor: typeof input.value_minor === "number" && Number.isFinite(input.value_minor)
      ? Math.max(Math.round(input.value_minor), 0)
      : 0,
    currency: (input.currency || "usd").toLowerCase(),
    stage: ensureStage(input.stage),
    probability: clamp(
      typeof input.probability === "number" ? Math.round(input.probability) : 10,
      0,
      100
    ),
    expected_close_date: input.expected_close_date || null,
    notes: input.notes?.trim() || null,
  };

  const inserted = await supabase
    .from("crm_deals")
    .insert(payload)
    .select()
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  const deal = inserted.data as Deal;

  // Build stakeholder list: primary (if set) + additional, deduped by contact_id.
  const stakeholders = new Map<string, DealRole>();
  if (input.primary_contact_id) {
    stakeholders.set(input.primary_contact_id, "champion");
  }
  for (const sh of input.additional_contacts ?? []) {
    if (!isUuid(sh.contact_id)) continue;
    stakeholders.set(sh.contact_id, ensureRole(sh.role));
  }

  if (stakeholders.size > 0) {
    const rows = Array.from(stakeholders.entries()).map(([contact_id, role]) => ({
      deal_id: deal.id,
      contact_id,
      role,
    }));
    const { error: linkErr } = await supabase.from("crm_deal_contacts").insert(rows);
    if (linkErr) {
      // Best-effort: keep the deal, surface the warning via thrown error
      throw new Error(`Deal created (${deal.id}) but stakeholder linking failed: ${linkErr.message}`);
    }
  }

  return deal;
}

export type UpdateDealPatch = {
  title?: string;
  primary_contact_id?: string | null;
  company?: string | null;
  value_minor?: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  expected_close_date?: string | null;
  notes?: string | null;
};

export async function updateDeal(
  supabase: SupabaseClient,
  userId: string,
  dealId: string,
  patch: UpdateDealPatch
): Promise<Deal> {
  if (!isUuid(dealId)) throw new Error("deal_id must be a UUID");

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("title cannot be blank");
    update.title = t;
  }
  if (patch.primary_contact_id !== undefined) update.contact_id = patch.primary_contact_id;
  if (patch.company !== undefined) update.company = patch.company?.toString().trim() || null;
  if (patch.value_minor !== undefined) {
    update.value_minor = Math.max(Math.round(patch.value_minor), 0);
  }
  if (patch.currency !== undefined) update.currency = patch.currency.toLowerCase();
  if (patch.stage !== undefined) update.stage = ensureStage(patch.stage);
  if (patch.probability !== undefined) {
    update.probability = clamp(Math.round(patch.probability), 0, 100);
  }
  if (patch.expected_close_date !== undefined) update.expected_close_date = patch.expected_close_date;
  if (patch.notes !== undefined) update.notes = patch.notes;

  if (Object.keys(update).length === 0) {
    throw new Error("nothing to update");
  }

  const { data, error } = await supabase
    .from("crm_deals")
    .update(update)
    .eq("id", dealId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Deal;
}

export async function getDeal(
  supabase: SupabaseClient,
  userId: string,
  dealId: string
): Promise<{
  deal: Deal;
  primary_contact: Contact | null;
  stakeholders: DealStakeholder[];
  activities: Activity[];
} | null> {
  if (!isUuid(dealId)) return null;

  const { data: dealData, error: dealErr } = await supabase
    .from("crm_deals")
    .select("*")
    .eq("id", dealId)
    .eq("user_id", userId)
    .maybeSingle();
  if (dealErr) throw new Error(dealErr.message);
  if (!dealData) return null;
  const deal = dealData as Deal;

  const [primaryRes, stakeholderRes, activityRes] = await Promise.all([
    deal.contact_id
      ? supabase
          .from("crm_contacts")
          .select("*")
          .eq("id", deal.contact_id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("crm_deal_contacts")
      .select("role, contact_id, crm_contacts(id, full_name, email, title, company)")
      .eq("deal_id", deal.id),
    supabase
      .from("crm_activities")
      .select("*")
      .eq("user_id", userId)
      .eq("deal_id", deal.id)
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  if (activityRes.error) throw new Error(activityRes.error.message);

  const primary_contact = (primaryRes.data as Contact | null) ?? null;
  const stakeholders: DealStakeholder[] = [];
  const stakeholderRows = (stakeholderRes.data ?? []) as unknown as Array<{
    role: DealRole;
    contact_id: string;
    crm_contacts: {
      id: string;
      full_name: string;
      email: string | null;
      title: string | null;
      company: string | null;
    } | null;
  }>;
  for (const row of stakeholderRows) {
    if (!row.crm_contacts) continue;
    stakeholders.push({
      contact_id: row.contact_id,
      role: row.role,
      full_name: row.crm_contacts.full_name,
      email: row.crm_contacts.email,
      title: row.crm_contacts.title,
      company: row.crm_contacts.company,
    });
  }

  return {
    deal,
    primary_contact,
    stakeholders,
    activities: (activityRes.data ?? []) as Activity[],
  };
}

export type ListDealsFilters = {
  stage?: DealStage;
  company?: string;
  contact_id?: string;
  open_only?: boolean;
  limit?: number;
  offset?: number;
};

export async function listDeals(
  supabase: SupabaseClient,
  userId: string,
  filters: ListDealsFilters
): Promise<{ deals: Deal[]; total: number }> {
  const limit = clamp(filters.limit ?? 50, 1, 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  let q = supabase
    .from("crm_deals")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (filters.stage) q = q.eq("stage", filters.stage);
  if (filters.company) q = q.ilike("company", `%${filters.company.trim()}%`);
  if (filters.contact_id && isUuid(filters.contact_id)) q = q.eq("contact_id", filters.contact_id);
  if (filters.open_only) q = q.not("stage", "in", "(won,lost)");

  q = q
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { deals: (data ?? []) as Deal[], total: count ?? 0 };
}

export type StageSummary = {
  stage: DealStage;
  count: number;
  total_value_minor: number;
  weighted_value_minor: number;
};

export async function pipelineSummary(
  supabase: SupabaseClient,
  userId: string,
  currency = "usd"
): Promise<{
  currency: string;
  stages: StageSummary[];
  total_open_value_minor: number;
  total_weighted_value_minor: number;
  recent_wins: Deal[];
  recent_losses: Deal[];
}> {
  // Pull all deals, aggregate in memory. For founder-scale CRM this is fine
  // (single-user, hundreds not millions of deals). Avoids needing an RPC.
  const { data, error } = await supabase
    .from("crm_deals")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const deals = (data ?? []) as Deal[];

  const stageMap = new Map<DealStage, StageSummary>();
  for (const stage of DEAL_STAGES) {
    stageMap.set(stage, { stage, count: 0, total_value_minor: 0, weighted_value_minor: 0 });
  }

  let totalOpen = 0;
  let totalWeighted = 0;
  const wins: Deal[] = [];
  const losses: Deal[] = [];

  for (const d of deals) {
    const summary = stageMap.get(d.stage);
    if (summary) {
      summary.count += 1;
      summary.total_value_minor += d.value_minor;
      summary.weighted_value_minor += Math.round((d.value_minor * d.probability) / 100);
    }
    if (d.stage !== "won" && d.stage !== "lost") {
      totalOpen += d.value_minor;
      totalWeighted += Math.round((d.value_minor * d.probability) / 100);
    }
    if (d.stage === "won") wins.push(d);
    if (d.stage === "lost") losses.push(d);
  }

  wins.sort((a, b) => (a.closed_at ?? "") < (b.closed_at ?? "") ? 1 : -1);
  losses.sort((a, b) => (a.closed_at ?? "") < (b.closed_at ?? "") ? 1 : -1);

  const stages = Array.from(stageMap.values()).sort(
    (a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]
  );

  return {
    currency,
    stages,
    total_open_value_minor: totalOpen,
    total_weighted_value_minor: totalWeighted,
    recent_wins: wins.slice(0, 5),
    recent_losses: losses.slice(0, 5),
  };
}

// ─── Activities ───────────────────────────────────────────────────────────────

export type LogActivityInput = {
  contact_id?: string;
  deal_id?: string;
  activity_type: ActivityType;
  subject?: string;
  body?: string;
  occurred_at?: string;
  gmail_thread_id?: string;
  gmail_message_id?: string;
  metadata?: Record<string, unknown>;
  idempotency_key?: string;
};

export async function logCrmActivity(
  supabase: SupabaseClient,
  userId: string,
  input: LogActivityInput
): Promise<Activity> {
  const activityType = ensureActivityType(input.activity_type);
  if (input.contact_id && !isUuid(input.contact_id)) throw new Error("contact_id must be a UUID");
  if (input.deal_id && !isUuid(input.deal_id)) throw new Error("deal_id must be a UUID");
  if (!input.contact_id && !input.deal_id && activityType !== "note" && activityType !== "task") {
    throw new Error("provide contact_id and/or deal_id (notes and tasks may stand alone)");
  }

  const payload = {
    user_id: userId,
    contact_id: input.contact_id ?? null,
    deal_id: input.deal_id ?? null,
    activity_type: activityType,
    subject: input.subject?.trim() || null,
    body: input.body?.trim() || null,
    occurred_at: input.occurred_at || new Date().toISOString(),
    gmail_thread_id: input.gmail_thread_id || null,
    gmail_message_id: input.gmail_message_id || null,
    metadata: input.metadata ?? {},
    idempotency_key: input.idempotency_key || null,
  };

  const { data, error } = await supabase
    .from("crm_activities")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Bump last_contacted_at on the linked contact (best-effort, fire and forget).
  if (payload.contact_id && (activityType === "email" || activityType === "call" || activityType === "meeting" || activityType === "linkedin")) {
    void supabase
      .from("crm_contacts")
      .update({ last_contacted_at: payload.occurred_at })
      .eq("id", payload.contact_id)
      .eq("user_id", userId)
      .then(({ error: bumpErr }) => {
        if (bumpErr) console.error("[crm] last_contacted_at bump failed", bumpErr.message);
      });
  }

  return data as Activity;
}

// Auto-log helper used by the email-tool post-hook in agent-tools.ts.
// Fire-and-forget. Never throws — safe to `void`.
export async function autoLogEmailActivity(
  supabase: SupabaseClient,
  userId: string,
  source: "gmail_create_draft" | "send_email" | "draft_email",
  input: { to?: string; subject?: string; body?: string },
  meta: { gmail_message_id?: string; gmail_thread_id?: string; provider_id?: string }
): Promise<void> {
  try {
    const to = input.to?.trim();
    if (!to) return;
    const contact = await findContactByEmail(supabase, userId, to);
    if (!contact) return;

    const idempotencyKey = meta.gmail_message_id
      ? `gmail_msg:${meta.gmail_message_id}`
      : meta.gmail_thread_id
      ? `gmail_thread:${meta.gmail_thread_id}:${(input.subject ?? "").slice(0, 50)}`
      : meta.provider_id
      ? `resend:${meta.provider_id}`
      : `email:${source}:${userId}:${contact.id}:${Date.now()}`;

    await logCrmActivity(supabase, userId, {
      contact_id: contact.id,
      activity_type: "email",
      subject: input.subject || "(no subject)",
      body: truncate(input.body, 2000),
      gmail_thread_id: meta.gmail_thread_id,
      gmail_message_id: meta.gmail_message_id,
      metadata: { source, provider_id: meta.provider_id ?? null },
      idempotency_key: idempotencyKey,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Idempotency conflict is expected on Claude retries — not an error.
    if (!/duplicate key|23505/i.test(msg)) {
      console.error("[crm] autoLogEmailActivity failed", { source, error: msg });
    }
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatContact(
  contact: Contact,
  deals: Deal[] = [],
  activities: Activity[] = []
): string {
  const lines: string[] = [];
  const statusBadge = contact.status === "do_not_contact" ? " ⚠️ DO NOT CONTACT" : ` [${contact.status}]`;
  lines.push(`# ${contact.full_name}${statusBadge}`);
  if (contact.title || contact.company) {
    lines.push(`${contact.title ?? ""}${contact.title && contact.company ? " @ " : ""}${contact.company ?? ""}`.trim());
  }
  const meta: string[] = [];
  if (contact.email) meta.push(`✉ ${contact.email}`);
  if (contact.phone) meta.push(`☎ ${contact.phone}`);
  if (contact.linkedin_url) meta.push(`in: ${contact.linkedin_url}`);
  if (meta.length) lines.push(meta.join(" · "));
  if (contact.tags?.length) lines.push(`Tags: ${contact.tags.join(", ")}`);
  if (contact.source) lines.push(`Source: ${contact.source}`);
  if (contact.last_contacted_at) {
    lines.push(`Last contacted: ${formatDate(contact.last_contacted_at)}`);
  }
  lines.push(`Contact id: ${contact.id}`);

  if (contact.notes) {
    lines.push("");
    lines.push("## Notes");
    lines.push(contact.notes);
  }

  if (deals.length) {
    lines.push("");
    lines.push(`## Deals (${deals.length})`);
    for (const d of deals) {
      lines.push(
        `- [${d.stage}] ${d.title} — ${formatMoneyMinor(d.value_minor, d.currency)} · ${d.probability}% · close ${formatDate(d.expected_close_date)} · id ${d.id}`
      );
    }
  }

  if (activities.length) {
    lines.push("");
    lines.push(`## Recent activity (${activities.length})`);
    for (const a of activities) {
      const summary = a.subject || truncate(a.body, 80) || "(no detail)";
      lines.push(`- ${formatDateTime(a.occurred_at)} · ${a.activity_type}: ${summary}`);
    }
  }

  return lines.join("\n");
}

export function formatContactList(contacts: Contact[], total: number): string {
  if (contacts.length === 0) return "No contacts match.";
  const lines: string[] = [];
  lines.push(`${contacts.length} of ${total} contact${total === 1 ? "" : "s"}:`);
  for (const c of contacts) {
    const status = c.status === "do_not_contact" ? " ⚠ DNC" : c.status === "customer" ? " ★" : "";
    const where = c.company ? ` @ ${c.company}` : "";
    const last = c.last_contacted_at ? ` · last ${formatDate(c.last_contacted_at)}` : "";
    lines.push(`- ${c.full_name}${where}${status} · ${c.email ?? "no email"}${last} · id ${c.id}`);
  }
  return lines.join("\n");
}

export function formatDeal(
  deal: Deal,
  primaryContact: Contact | null,
  stakeholders: DealStakeholder[],
  activities: Activity[]
): string {
  const lines: string[] = [];
  lines.push(`# ${deal.title}`);
  lines.push(
    `${formatMoneyMinor(deal.value_minor, deal.currency)} · ${deal.stage} · ${deal.probability}%${deal.expected_close_date ? ` · close ${formatDate(deal.expected_close_date)}` : ""}`
  );
  if (deal.company) lines.push(`Company: ${deal.company}`);
  if (deal.closed_at) lines.push(`Closed: ${formatDate(deal.closed_at)}`);
  lines.push(`Deal id: ${deal.id}`);

  if (primaryContact) {
    lines.push("");
    lines.push("## Primary contact");
    lines.push(`- ${primaryContact.full_name}${primaryContact.title ? ` (${primaryContact.title})` : ""}${primaryContact.email ? ` · ${primaryContact.email}` : ""} · id ${primaryContact.id}`);
  }

  const others = stakeholders.filter((s) => s.contact_id !== deal.contact_id);
  if (others.length) {
    lines.push("");
    lines.push(`## Other stakeholders (${others.length})`);
    for (const s of others) {
      lines.push(`- [${s.role}] ${s.full_name}${s.title ? ` (${s.title})` : ""}${s.email ? ` · ${s.email}` : ""} · id ${s.contact_id}`);
    }
  }

  if (deal.notes) {
    lines.push("");
    lines.push("## Notes");
    lines.push(deal.notes);
  }

  if (activities.length) {
    lines.push("");
    lines.push(`## Recent activity (${activities.length})`);
    for (const a of activities) {
      const summary = a.subject || truncate(a.body, 80) || "(no detail)";
      lines.push(`- ${formatDateTime(a.occurred_at)} · ${a.activity_type}: ${summary}`);
    }
  }

  return lines.join("\n");
}

export function formatDealList(deals: Deal[], total: number): string {
  if (deals.length === 0) return "No deals match.";
  const lines: string[] = [];
  lines.push(`${deals.length} of ${total} deal${total === 1 ? "" : "s"}:`);
  for (const d of deals) {
    const company = d.company ? ` @ ${d.company}` : "";
    const close = d.expected_close_date ? ` · close ${formatDate(d.expected_close_date)}` : "";
    lines.push(
      `- [${d.stage}] ${d.title}${company} — ${formatMoneyMinor(d.value_minor, d.currency)} · ${d.probability}%${close} · id ${d.id}`
    );
  }
  return lines.join("\n");
}

export function formatPipelineSummary(summary: Awaited<ReturnType<typeof pipelineSummary>>): string {
  const lines: string[] = [];
  const fm = (v: number) => formatMoneyMinor(v, summary.currency);
  lines.push("# Pipeline summary");
  lines.push(
    `Open total: **${fm(summary.total_open_value_minor)}** · Weighted: **${fm(summary.total_weighted_value_minor)}**`
  );
  lines.push("");
  lines.push("## By stage");
  lines.push("| Stage | Count | Total | Weighted |");
  lines.push("|---|---:|---:|---:|");
  for (const s of summary.stages) {
    lines.push(
      `| ${s.stage} | ${s.count} | ${fm(s.total_value_minor)} | ${fm(s.weighted_value_minor)} |`
    );
  }

  if (summary.recent_wins.length) {
    lines.push("");
    lines.push("## Recent wins");
    for (const d of summary.recent_wins) {
      lines.push(`- ${d.title} — ${fm(d.value_minor)} · closed ${formatDate(d.closed_at)}`);
    }
  }
  if (summary.recent_losses.length) {
    lines.push("");
    lines.push("## Recent losses");
    for (const d of summary.recent_losses) {
      lines.push(`- ${d.title} — ${fm(d.value_minor)} · closed ${formatDate(d.closed_at)}`);
    }
  }

  return lines.join("\n");
}

export function formatActivity(activity: Activity, contactName?: string | null): string {
  const target = contactName ? ` · ${contactName}` : "";
  const summary = activity.subject || truncate(activity.body, 100) || "(no detail)";
  return `Logged ${activity.activity_type}${target} at ${formatDateTime(activity.occurred_at)}: ${summary} (id ${activity.id})`;
}
