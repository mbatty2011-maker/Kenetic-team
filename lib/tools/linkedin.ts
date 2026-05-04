import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tavilySearch } from "./search";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LinkedInProvider = "proxycurl" | "tavily";

export type LinkedInExperience = {
  title: string | null;
  company: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  description: string | null;
};

export type LinkedInEducation = {
  school: string | null;
  degree: string | null;
  field_of_study: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type LinkedInProfile = {
  url: string;
  full_name: string | null;
  headline: string | null;
  summary: string | null;
  occupation: string | null;
  current_company: string | null;
  current_title: string | null;
  location: string | null;
  experiences: LinkedInExperience[];
  education: LinkedInEducation[];
  source_provider: LinkedInProvider;
  fetched_at: string;
};

const CACHE_TTL_DAYS = 30;
const PROXYCURL_DAILY_CAP = 50;
const PROXYCURL_TIMEOUT_MS = 30_000;

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function normalizeLinkedInUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.search = "";
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (!path.startsWith("/in/") && !path.startsWith("/pub/")) return "";
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return "";
  }
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

// ─── Cache ────────────────────────────────────────────────────────────────────

async function cacheGet(
  supabase: SupabaseClient,
  userId: string,
  urlHash: string
): Promise<LinkedInProfile | null> {
  const { data, error } = await supabase
    .from("crm_linkedin_profiles")
    .select("data, provider, fetched_at, linkedin_url")
    .eq("user_id", userId)
    .eq("url_hash", urlHash)
    .maybeSingle();
  if (error || !data) return null;
  const fetchedAt = new Date(data.fetched_at as string).getTime();
  const expired = Date.now() - fetchedAt > CACHE_TTL_DAYS * 86400_000;
  if (expired) return null;
  const profile = data.data as LinkedInProfile;
  return {
    ...profile,
    source_provider: data.provider as LinkedInProvider,
    fetched_at: data.fetched_at as string,
    url: data.linkedin_url as string,
  };
}

async function cachePut(
  supabase: SupabaseClient,
  userId: string,
  url: string,
  urlHash: string,
  profile: LinkedInProfile,
  provider: LinkedInProvider
): Promise<void> {
  await supabase
    .from("crm_linkedin_profiles")
    .upsert(
      {
        user_id: userId,
        linkedin_url: url,
        url_hash: urlHash,
        data: profile,
        provider,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "user_id,url_hash" }
    );
}

async function dailyProxycurlCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("crm_linkedin_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("provider", "proxycurl")
    .gte("fetched_at", startOfDay.toISOString());
  if (error) return 0;
  return count ?? 0;
}

// ─── Proxycurl ────────────────────────────────────────────────────────────────

type ProxycurlDate = { day?: number; month?: number; year?: number };

type ProxycurlExperience = {
  title?: string | null;
  company?: string | null;
  description?: string | null;
  location?: string | null;
  starts_at?: ProxycurlDate | null;
  ends_at?: ProxycurlDate | null;
};

type ProxycurlEducation = {
  school?: string | null;
  degree_name?: string | null;
  field_of_study?: string | null;
  starts_at?: ProxycurlDate | null;
  ends_at?: ProxycurlDate | null;
};

type ProxycurlResponse = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  headline?: string | null;
  summary?: string | null;
  occupation?: string | null;
  city?: string | null;
  state?: string | null;
  country_full_name?: string | null;
  experiences?: ProxycurlExperience[];
  education?: ProxycurlEducation[];
};

function formatProxycurlDate(d: ProxycurlDate | null | undefined): string | null {
  if (!d || !d.year) return null;
  if (d.month) {
    return `${d.year}-${String(d.month).padStart(2, "0")}`;
  }
  return String(d.year);
}

function joinLocation(city: string | null | undefined, state: string | null | undefined, country: string | null | undefined): string | null {
  const parts = [city, state, country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

async function fetchProxycurl(url: string): Promise<LinkedInProfile> {
  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey) throw new Error("PROXYCURL_API_KEY not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXYCURL_TIMEOUT_MS);
  let res: Response;
  try {
    const params = new URLSearchParams({
      url,
      use_cache: "if-present",
      fallback_to_cache: "on-error",
    });
    res = await fetch(`https://nubela.co/proxycurl/api/v2/linkedin?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Proxycurl ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as ProxycurlResponse;

  const experiences: LinkedInExperience[] = (data.experiences ?? []).slice(0, 8).map((e) => ({
    title: e.title ?? null,
    company: e.company ?? null,
    starts_at: formatProxycurlDate(e.starts_at),
    ends_at: formatProxycurlDate(e.ends_at),
    location: e.location ?? null,
    description: e.description ?? null,
  }));

  const education: LinkedInEducation[] = (data.education ?? []).slice(0, 5).map((e) => ({
    school: e.school ?? null,
    degree: e.degree_name ?? null,
    field_of_study: e.field_of_study ?? null,
    starts_at: formatProxycurlDate(e.starts_at),
    ends_at: formatProxycurlDate(e.ends_at),
  }));

  const current = experiences.find((e) => !e.ends_at) ?? experiences[0] ?? null;

  const fullName =
    data.full_name ||
    [data.first_name, data.last_name].filter(Boolean).join(" ") ||
    null;

  return {
    url,
    full_name: fullName,
    headline: data.headline ?? null,
    summary: data.summary ?? null,
    occupation: data.occupation ?? null,
    current_company: current?.company ?? null,
    current_title: current?.title ?? null,
    location: joinLocation(data.city, data.state, data.country_full_name),
    experiences,
    education,
    source_provider: "proxycurl",
    fetched_at: new Date().toISOString(),
  };
}

// ─── Tavily fallback ──────────────────────────────────────────────────────────

function parseSnippetTitle(title: string): { name: string | null; headline: string | null } {
  // Common Tavily/LinkedIn title format: "Jane Doe - VP Sales at Acme - LinkedIn"
  // or "Jane Doe | LinkedIn" or "Jane Doe - LinkedIn"
  const cleaned = title.replace(/\s*[-|]\s*LinkedIn.*$/i, "").trim();
  const parts = cleaned.split(/\s+[-|]\s+/);
  if (parts.length >= 2) {
    return { name: parts[0]?.trim() || null, headline: parts.slice(1).join(" — ").trim() || null };
  }
  return { name: cleaned || null, headline: null };
}

async function fetchTavilySnippet(url: string): Promise<LinkedInProfile> {
  const search = await tavilySearch(url, { maxResults: 3, includeAnswer: false });
  const hit = search.results.find((r) => r.url.toLowerCase().includes("linkedin.com")) ?? search.results[0];
  const { name, headline } = hit ? parseSnippetTitle(hit.title) : { name: null, headline: null };
  return {
    url,
    full_name: name,
    headline: headline,
    summary: hit?.content ?? null,
    occupation: headline,
    current_company: null,
    current_title: null,
    location: null,
    experiences: [],
    education: [],
    source_provider: "tavily",
    fetched_at: new Date().toISOString(),
  };
}

async function discoverUrlViaSearch(name: string, company?: string): Promise<string | null> {
  const query = `site:linkedin.com/in/ "${name}"${company ? ` "${company}"` : ""}`;
  const search = await tavilySearch(query, { maxResults: 5, includeAnswer: false });
  for (const r of search.results) {
    const normalized = normalizeLinkedInUrl(r.url);
    if (normalized) return normalized;
  }
  return null;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export type LookupOptions = {
  url?: string;
  name?: string;
  company?: string;
  tier?: "free" | "solo" | string | null;
};

export type LookupResult =
  | { ok: true; profile: LinkedInProfile; cached: boolean }
  | { ok: false; reason: string };

export async function lookupLinkedInProfile(
  supabase: SupabaseClient,
  userId: string,
  opts: LookupOptions
): Promise<LookupResult> {
  let url = opts.url ? normalizeLinkedInUrl(opts.url) : "";

  if (!url) {
    if (!opts.name) {
      return { ok: false, reason: "Provide a LinkedIn URL or a name (and optionally company)." };
    }
    const discovered = await discoverUrlViaSearch(opts.name, opts.company);
    if (!discovered) {
      return {
        ok: false,
        reason: `Could not find a LinkedIn profile for "${opts.name}"${opts.company ? ` at ${opts.company}` : ""}. Provide the URL directly.`,
      };
    }
    url = discovered;
  }

  const urlHash = hashUrl(url);

  const cached = await cacheGet(supabase, userId, urlHash);
  if (cached) {
    return { ok: true, profile: cached, cached: true };
  }

  const proxycurlAvailable = !!process.env.PROXYCURL_API_KEY && opts.tier !== "free";
  if (proxycurlAvailable) {
    const usedToday = await dailyProxycurlCount(supabase, userId);
    if (usedToday >= PROXYCURL_DAILY_CAP) {
      // Hit daily cap — degrade to Tavily for the rest of the day.
      try {
        const profile = await fetchTavilySnippet(url);
        await cachePut(supabase, userId, url, urlHash, profile, "tavily");
        return { ok: true, profile, cached: false };
      } catch (err) {
        return { ok: false, reason: `Daily Proxycurl cap (${PROXYCURL_DAILY_CAP}) hit and Tavily fallback failed: ${(err as Error).message}` };
      }
    }
    try {
      const profile = await fetchProxycurl(url);
      await cachePut(supabase, userId, url, urlHash, profile, "proxycurl");
      return { ok: true, profile, cached: false };
    } catch (err) {
      // Fall through to Tavily on Proxycurl error.
      console.error("[linkedin] proxycurl failed, falling back to tavily", { url, err: (err as Error).message });
    }
  }

  try {
    const profile = await fetchTavilySnippet(url);
    await cachePut(supabase, userId, url, urlHash, profile, "tavily");
    return { ok: true, profile, cached: false };
  } catch (err) {
    return { ok: false, reason: `LinkedIn lookup failed: ${(err as Error).message}` };
  }
}

// ─── Formatter ────────────────────────────────────────────────────────────────

export function formatLinkedInProfile(profile: LinkedInProfile, cached: boolean): string {
  const lines: string[] = [];
  const provider = profile.source_provider === "proxycurl" ? "Proxycurl" : "search snippet";
  const cacheTag = cached ? " (cached)" : "";
  lines.push(`# ${profile.full_name ?? "(unknown name)"} — LinkedIn`);
  if (profile.headline) lines.push(profile.headline);
  if (profile.current_company || profile.current_title) {
    const role = [profile.current_title, profile.current_company].filter(Boolean).join(" @ ");
    if (role) lines.push(`Currently: ${role}`);
  }
  if (profile.location) lines.push(`Location: ${profile.location}`);
  lines.push(`URL: ${profile.url}`);
  lines.push(`Source: ${provider}${cacheTag}`);

  if (profile.summary) {
    lines.push("");
    lines.push("## Summary");
    lines.push(profile.summary.slice(0, 800));
  }

  if (profile.experiences.length) {
    lines.push("");
    lines.push("## Experience");
    for (const e of profile.experiences.slice(0, 6)) {
      const dates = e.starts_at || e.ends_at
        ? ` (${e.starts_at ?? "?"} – ${e.ends_at ?? "present"})`
        : "";
      const where = e.company ? ` @ ${e.company}` : "";
      lines.push(`- ${e.title ?? "(role)"}${where}${dates}`);
    }
  }

  if (profile.education.length) {
    lines.push("");
    lines.push("## Education");
    for (const e of profile.education.slice(0, 3)) {
      const detail = [e.degree, e.field_of_study].filter(Boolean).join(", ");
      const dates = e.starts_at || e.ends_at
        ? ` (${e.starts_at ?? "?"} – ${e.ends_at ?? "?"})`
        : "";
      lines.push(`- ${e.school ?? "(school)"}${detail ? ` — ${detail}` : ""}${dates}`);
    }
  }

  if (profile.source_provider === "tavily" && profile.experiences.length === 0) {
    lines.push("");
    lines.push("_Note: Search-snippet fallback only — limited fidelity. Set PROXYCURL_API_KEY for full profile data._");
  }

  return lines.join("\n");
}
