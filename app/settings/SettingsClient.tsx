"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FeedbackModal from "@/components/chat/FeedbackModal";
import StripeConnectModal from "@/components/settings/StripeConnectModal";

interface Profile {
  full_name: string;
  company_name: string;
  role_title: string;
  user_context: string;
}

interface KnowledgeBaseEntry {
  id: string;
  section_title: string;
  content: string;
  created_at: string;
}

interface BrandProfileForm {
  brand_voice: string;
  target_audience: string;
  value_propositions: string;
  mission: string;
  taglines: string;
  dos_and_donts: string;
}

interface GoogleConnection {
  connected: boolean;
  email?: string;
}

interface StripeConnection {
  connected: boolean;
  account_label?: string | null;
  livemode?: boolean | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    company_name: "",
    role_title: "",
    user_context: "",
  });
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [toast, setToast] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [kbEntries, setKbEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [brand, setBrand] = useState<BrandProfileForm>({
    brand_voice: "",
    target_audience: "",
    value_propositions: "",
    mission: "",
    taglines: "",
    dos_and_donts: "",
  });
  const [savingBrand, setSavingBrand] = useState(false);
  const [savedBrand, setSavedBrand] = useState(false);
  const [brandMoreOpen, setBrandMoreOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "deleting">("idle");
  const [google, setGoogle] = useState<GoogleConnection>({ connected: false });
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [stripe, setStripe] = useState<StripeConnection>({ connected: false });
  const [disconnectingStripe, setDisconnectingStripe] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("get_oauth_connection_status", {
      p_provider: "google",
    });
    if (error) {
      setGoogle({ connected: false });
      return;
    }
    const row = (data as { google_email?: string }[] | null)?.[0];
    setGoogle({ connected: !!row, email: row?.google_email });
  }, [supabase]);

  useEffect(() => {
    loadGoogleStatus();
  }, [loadGoogleStatus]);

  const loadStripeStatus = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("get_oauth_connection_status", {
      p_provider: "stripe",
    });
    if (error) {
      setStripe({ connected: false });
      return;
    }
    const row = (data as { account_label?: string | null; livemode?: boolean | null }[] | null)?.[0];
    setStripe({
      connected: !!row,
      account_label: row?.account_label ?? null,
      livemode: row?.livemode ?? null,
    });
  }, [supabase]);

  useEffect(() => {
    loadStripeStatus();
  }, [loadStripeStatus]);

  // Surface OAuth callback outcomes (?google=connected|error) and clear the param.
  useEffect(() => {
    const param = searchParams.get("google");
    if (!param) return;
    if (param === "connected") {
      showToast("Google connected");
      loadGoogleStatus();
    } else if (param === "error") {
      const reason = searchParams.get("reason") ?? "unknown_error";
      showToast(`Google connection failed (${reason})`);
    }
    router.replace("/settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? "");

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (data) {
      const d = data as Record<string, unknown>;
      setProfile({
        full_name: (d.full_name as string) ?? "",
        company_name: (d.company_name as string) ?? "",
        role_title: (d.role_title as string) ?? "",
        user_context: (d.user_context as string) ?? "",
      });
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfMonth.toISOString());

    setMessageCount(count ?? 0);

    const { data: kbData } = await supabase
      .from("knowledge_base")
      .select("id, section_title, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setKbEntries((kbData as KnowledgeBaseEntry[]) ?? []);

    const { data: brandData } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (brandData) {
      const b = brandData as Record<string, unknown>;
      setBrand({
        brand_voice:        (b.brand_voice as string) ?? "",
        target_audience:    (b.target_audience as string) ?? "",
        value_propositions: (b.value_propositions as string) ?? "",
        mission:            (b.mission as string) ?? "",
        taglines:           (b.taglines as string) ?? "",
        dos_and_donts:      (b.dos_and_donts as string) ?? "",
      });
      if ((b.mission as string) || (b.taglines as string) || (b.dos_and_donts as string)) {
        setBrandMoreOpen(true);
      }
    }
  }

  async function saveProfile() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("upsert_profile", {
      p_user_id:    user.id,
      p_full_name:  profile.full_name,
      p_company_name: profile.company_name,
      p_role_title: profile.role_title,
      p_user_context: profile.user_context,
    });

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      console.error("Profile save error:", error);
      showToast(`Save failed: ${error.message}`);
    }
  }

  async function saveBrand() {
    setSavingBrand(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingBrand(false); return; }

    const { error } = await supabase
      .from("brand_profiles")
      .upsert({ user_id: user.id, ...brand }, { onConflict: "user_id" });

    setSavingBrand(false);
    if (!error) {
      setSavedBrand(true);
      setTimeout(() => setSavedBrand(false), 2000);
    } else {
      console.error("Brand save error:", error);
      showToast(`Save failed: ${error.message}`);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleDeleteAccount() {
    setDeleteState("deleting");
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? "Failed to delete account");
      }
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      showToast(msg);
      setDeleteState("idle");
    }
  }

  async function deleteKbEntry(id: string) {
    setKbEntries((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("knowledge_base").delete().eq("id", id);
  }

  async function clearKnowledgeBase() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setKbEntries([]);
    await supabase.from("knowledge_base").delete().eq("user_id", user.id);
    showToast("Knowledge base cleared");
  }

  async function disconnectGoogle() {
    setDisconnectingGoogle(true);
    try {
      const res = await fetch("/api/oauth/google/disconnect", { method: "POST" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Disconnect failed" }));
        throw new Error(error ?? "Disconnect failed");
      }
      setGoogle({ connected: false });
      showToast("Google disconnected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Disconnect failed";
      showToast(msg);
    } finally {
      setDisconnectingGoogle(false);
    }
  }

  async function disconnectStripe() {
    setDisconnectingStripe(true);
    try {
      const res = await fetch("/api/integrations/stripe/disconnect", { method: "POST" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Disconnect failed" }));
        throw new Error(error ?? "Disconnect failed");
      }
      setStripe({ connected: false });
      showToast("Stripe disconnected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Disconnect failed";
      showToast(msg);
    } finally {
      setDisconnectingStripe(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  const monoStyle = { fontFamily: "var(--font-space-mono), monospace" };

  const labelClass = "block text-white/50 text-xs uppercase tracking-widest mb-1.5";
  const inputClass = "w-full bg-transparent text-white text-sm focus:outline-none border-b border-white/20 focus:border-white pb-1.5 transition-colors";
  const saveBtn = "px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 disabled:opacity-40";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-white sticky top-0 z-10 bg-black">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/chat"
            className="p-2 border border-white text-white hover:bg-white hover:text-black transition-colors duration-200"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-white text-xs font-bold uppercase tracking-widest" style={monoStyle}>
            Settings
          </h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-8">

        {/* Profile */}
        <section>
          <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest px-1 mb-3" style={monoStyle}>
            Profile
          </h2>
          <div className="border border-white">
            <div className="divide-y divide-white/10">
              <div className="px-4 py-3">
                <label className={labelClass} style={monoStyle}>Full name</label>
                <input
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  className={inputClass}
                  placeholder="Your name"
                />
              </div>
              <div className="px-4 py-3">
                <label className={labelClass} style={monoStyle}>Company</label>
                <input
                  type="text"
                  value={profile.company_name}
                  onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                  className={inputClass}
                  placeholder="Your company"
                />
              </div>
              <div className="px-4 py-3">
                <label className={labelClass} style={monoStyle}>Role</label>
                <input
                  type="text"
                  value={profile.role_title}
                  onChange={(e) => setProfile({ ...profile, role_title: e.target.value })}
                  className={inputClass}
                  placeholder="Your role"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-white/10">
              <button onClick={saveProfile} disabled={saving} className={saveBtn} style={monoStyle}>
                {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </section>

        {/* Agent Memory */}
        <section>
          <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest px-1 mb-1" style={monoStyle}>
            Agent Memory
          </h2>
          <p className="text-white/30 text-xs px-1 mb-3" style={monoStyle}>
            Everything here is injected into every agent&apos;s context. Describe your company, product, goals, strategy — anything they should always know.
          </p>
          <div className="border border-white">
            <div className="px-4 py-3">
              <textarea
                value={profile.user_context}
                onChange={(e) => setProfile({ ...profile, user_context: e.target.value })}
                placeholder={`Example:\n## About My Company\nWe're building X, a Y for Z. Currently in [stage].\n\n## My Goals\n- Ship v1 by [date]\n- Land first paying customer\n\n## Key People\n- [Name]: [role]\n\n## Context Agents Should Know\n[Anything else relevant]`}
                rows={12}
                className="w-full bg-transparent text-white text-sm focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
              />
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-white/30 text-xs" style={monoStyle}>
                {profile.user_context.length > 0
                  ? `${profile.user_context.length.toLocaleString()} chars`
                  : "Empty"}
              </span>
              <button onClick={saveProfile} disabled={saving} className={saveBtn} style={monoStyle}>
                {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </section>

        {/* Brand */}
        <section>
          <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest px-1 mb-1" style={monoStyle}>
            Brand
          </h2>
          <p className="text-white/30 text-xs px-1 mb-3" style={monoStyle}>
            Maya uses this in every deliverable — voice, audience, and core messaging anchor all copy she writes.
          </p>
          <div className="border border-white">
            <div className="divide-y divide-white/10">
              <div className="px-4 py-3">
                <label className={labelClass} style={monoStyle}>Brand Voice</label>
                <textarea
                  value={brand.brand_voice}
                  onChange={(e) => setBrand({ ...brand, brand_voice: e.target.value })}
                  placeholder="Direct, dry, no jargon. Confident without bragging."
                  rows={6}
                  className="w-full bg-transparent text-white text-sm focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
                />
              </div>
              <div className="px-4 py-3">
                <label className={labelClass} style={monoStyle}>Target Audience</label>
                <textarea
                  value={brand.target_audience}
                  onChange={(e) => setBrand({ ...brand, target_audience: e.target.value })}
                  placeholder="Solo founders & seed-stage CEOs running ops without a marketing hire."
                  rows={4}
                  className="w-full bg-transparent text-white text-sm focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
                />
              </div>
              <div className="px-4 py-3">
                <label className={labelClass} style={monoStyle}>Value Propositions</label>
                <textarea
                  value={brand.value_propositions}
                  onChange={(e) => setBrand({ ...brand, value_propositions: e.target.value })}
                  placeholder={`What you do for them, in 2–4 short lines.\n— Replace 5 hires with 1 chat.\n— Real deliverables, not advice.`}
                  rows={6}
                  className="w-full bg-transparent text-white text-sm focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
                />
              </div>
              {brandMoreOpen && (
                <>
                  <div className="px-4 py-3">
                    <label className={labelClass} style={monoStyle}>Mission</label>
                    <textarea
                      value={brand.mission}
                      onChange={(e) => setBrand({ ...brand, mission: e.target.value })}
                      placeholder="What you're trying to do in the world."
                      rows={3}
                      className="w-full bg-transparent text-white text-sm focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
                    />
                  </div>
                  <div className="px-4 py-3">
                    <label className={labelClass} style={monoStyle}>Taglines</label>
                    <textarea
                      value={brand.taglines}
                      onChange={(e) => setBrand({ ...brand, taglines: e.target.value })}
                      placeholder="Short repeatable lines used across surfaces."
                      rows={3}
                      className="w-full bg-transparent text-white text-sm focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
                    />
                  </div>
                  <div className="px-4 py-3">
                    <label className={labelClass} style={monoStyle}>Do&apos;s &amp; Don&apos;ts</label>
                    <textarea
                      value={brand.dos_and_donts}
                      onChange={(e) => setBrand({ ...brand, dos_and_donts: e.target.value })}
                      placeholder={`DO: lowercase headlines, em-dashes for asides.\nDON'T: exclamation marks, "revolutionary", "synergy".`}
                      rows={5}
                      className="w-full bg-transparent text-white text-sm focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
              <button
                onClick={() => setBrandMoreOpen((o) => !o)}
                className="text-white/40 hover:text-white text-xs uppercase tracking-widest transition-colors"
                style={monoStyle}
              >
                {brandMoreOpen ? "− Hide optional" : "+ More fields"}
              </button>
              <button onClick={saveBrand} disabled={savingBrand} className={saveBtn} style={monoStyle}>
                {savedBrand ? "Saved ✓" : savingBrand ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </section>

        {/* Knowledge Base */}
        <section>
          <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest px-1 mb-1" style={monoStyle}>
            Knowledge Base
          </h2>
          <p className="text-white/30 text-xs px-1 mb-3" style={monoStyle}>
            Sections your agents have saved from research and conversations.
          </p>
          <div className="border border-white">
            {kbEntries.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-white/30 text-xs" style={monoStyle}>
                  No entries yet. Agents will save research and key findings here automatically.
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/10">
                  {kbEntries.map((entry) => (
                    <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-white/50 text-xs uppercase tracking-widest mb-1" style={monoStyle}>
                          {entry.section_title}
                        </p>
                        <p className="text-white text-xs leading-relaxed line-clamp-2" style={monoStyle}>
                          {entry.content}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteKbEntry(entry.id)}
                        className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0 pt-0.5"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-white/10">
                  <button
                    onClick={clearKnowledgeBase}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors uppercase tracking-widest"
                    style={monoStyle}
                  >
                    Clear All
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Integrations */}
        <section>
          <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest px-1 mb-3" style={monoStyle}>
            Integrations
          </h2>
          <div className="border border-white divide-y divide-white/10">
            <div className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-white text-sm">Google (Gmail + Calendar)</div>
                <div className="text-white/40 text-xs truncate" style={monoStyle}>
                  {google.connected
                    ? `Connected as ${google.email ?? "your Google account"}`
                    : "Not connected"}
                </div>
              </div>
              {google.connected ? (
                <button
                  onClick={disconnectGoogle}
                  disabled={disconnectingGoogle}
                  className="px-3 py-1.5 text-red-400 border border-red-500/40 text-xs font-bold uppercase tracking-widest hover:bg-red-950/30 transition-colors disabled:opacity-40"
                  style={monoStyle}
                >
                  {disconnectingGoogle ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : (
                <a
                  href="/api/oauth/google/start?next=/settings"
                  className={saveBtn}
                  style={monoStyle}
                >
                  Connect
                </a>
              )}
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-white text-sm">Stripe (read-only)</div>
                <div className="text-white/40 text-xs truncate" style={monoStyle}>
                  {stripe.connected
                    ? stripe.livemode === false
                      ? `Connected (test mode)${stripe.account_label ? ` — ${stripe.account_label}` : ""}`
                      : `Connected as ${stripe.account_label ?? "your Stripe account"}`
                    : "Not connected — Jeremy needs this to pull MRR / revenue / P&L"}
                </div>
              </div>
              {stripe.connected ? (
                <button
                  onClick={disconnectStripe}
                  disabled={disconnectingStripe}
                  className="px-3 py-1.5 text-red-400 border border-red-500/40 text-xs font-bold uppercase tracking-widest hover:bg-red-950/30 transition-colors disabled:opacity-40"
                  style={monoStyle}
                >
                  {disconnectingStripe ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : (
                <button
                  onClick={() => setShowStripeModal(true)}
                  className={saveBtn}
                  style={monoStyle}
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest px-1 mb-3" style={monoStyle}>
            Notifications
          </h2>
          <div className="border border-white divide-y divide-white/10">
            {[
              "Email me when Alex flags something urgent",
              "Weekly summary",
            ].map((label) => (
              <div key={label} className="px-4 py-3.5 flex items-center justify-between">
                <span className="text-white text-sm">{label}</span>
                <span className="text-white/30 text-xs border border-white/30 px-2 py-0.5" style={monoStyle}>
                  Coming Soon
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Billing */}
        <section>
          <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest px-1 mb-3" style={monoStyle}>
            Billing
          </h2>
          <div className="border border-white divide-y divide-white/10">
            <div className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-white text-sm">Current plan</span>
              <span className="text-white text-xs border border-white px-2.5 py-1" style={monoStyle}>
                Free
              </span>
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-white text-sm">Messages this month</span>
              <span className="text-white text-sm font-bold" style={monoStyle}>{messageCount}</span>
            </div>
            <div className="px-4 py-3.5">
              <Link
                href="/pricing"
                className="block w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 text-center"
                style={monoStyle}
              >
                View Plans
              </Link>
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest px-1 mb-3" style={monoStyle}>
            Account
          </h2>
          <div className="border border-white divide-y divide-white/10">
            <div className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-white/50 text-sm" style={monoStyle}>Email</span>
              <span className="text-white text-sm" style={monoStyle}>{email}</span>
            </div>
            <button
              onClick={() => showToast("Coming soon")}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
            >
              <span className="text-white text-sm">Change Password</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/40">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => setShowFeedback(true)}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
            >
              <span className="text-white text-sm">Give Feedback</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/40">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-red-950/20 transition-colors text-left"
            >
              <span className="text-red-400 text-sm">Sign Out</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-red-400">
                <path d="M6 3H4a1 1 0 00-1 1v8a1 1 0 001 1h2M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {deleteState === "idle" && (
              <button
                onClick={() => setDeleteState("confirm")}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-red-950/20 transition-colors text-left"
              >
                <span className="text-red-400/60 text-sm">Delete Account</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-red-400/60">
                  <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {deleteState === "confirm" && (
              <div className="px-4 py-4 space-y-3">
                <p className="text-white/50 text-xs leading-relaxed" style={monoStyle}>
                  This will permanently delete your account and all data — conversations, messages, and settings. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    className="px-4 py-2 bg-red-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-red-700 transition-colors border border-red-600"
                    style={monoStyle}
                  >
                    Delete Forever
                  </button>
                  <button
                    onClick={() => setDeleteState("idle")}
                    className="px-4 py-2 text-white/60 text-xs font-bold uppercase tracking-widest hover:text-white border border-white/20 hover:border-white transition-colors"
                    style={monoStyle}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {deleteState === "deleting" && (
              <div className="px-4 py-3.5">
                <span className="text-white/30 text-xs" style={monoStyle}>Deleting account…</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-bold px-4 py-2.5 uppercase tracking-widest"
          style={monoStyle}
        >
          {toast}
        </div>
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      {showStripeModal && (
        <StripeConnectModal
          onClose={() => setShowStripeModal(false)}
          onConnected={loadStripeStatus}
        />
      )}
    </div>
  );
}
