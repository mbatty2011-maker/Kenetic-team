"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FeedbackModal from "@/components/chat/FeedbackModal";

interface Profile {
  full_name: string;
  company_name: string;
  role_title: string;
  user_context: string;
}

export default function SettingsPage() {
  const router = useRouter();
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

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <div className="min-h-screen bg-apple-gray-50">
      {/* Header */}
      <div className="glass border-b border-apple-gray-100 sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link
            href="/chat"
            className="p-2 rounded-apple-md hover:bg-apple-gray-100 transition-colors text-apple-gray-500 hover:text-apple-gray-950"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-apple-gray-950">Settings</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">

        {/* Profile */}
        <section>
          <h2 className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider px-1 mb-2">
            Profile
          </h2>
          <div className="bg-white rounded-apple-xl shadow-apple-sm overflow-hidden">
            <div className="divide-y divide-apple-gray-100">
              <div className="px-4 py-3">
                <label className="block text-xs text-apple-gray-500 mb-1">Full name</label>
                <input
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  className="w-full text-sm text-apple-gray-950 bg-transparent focus:outline-none"
                  placeholder="Your name"
                />
              </div>
              <div className="px-4 py-3">
                <label className="block text-xs text-apple-gray-500 mb-1">Company</label>
                <input
                  type="text"
                  value={profile.company_name}
                  onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                  className="w-full text-sm text-apple-gray-950 bg-transparent focus:outline-none"
                  placeholder="Your company"
                />
              </div>
              <div className="px-4 py-3">
                <label className="block text-xs text-apple-gray-500 mb-1">Role</label>
                <input
                  type="text"
                  value={profile.role_title}
                  onChange={(e) => setProfile({ ...profile, role_title: e.target.value })}
                  className="w-full text-sm text-apple-gray-950 bg-transparent focus:outline-none"
                  placeholder="Your role"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-apple-gray-100">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="px-4 py-2 bg-apple-gray-950 text-white text-sm font-medium rounded-apple-md hover:bg-apple-gray-800 disabled:opacity-50 transition-all"
              >
                {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </section>

        {/* Agent Memory */}
        <section>
          <h2 className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider px-1 mb-1">
            Agent Memory
          </h2>
          <p className="text-xs text-apple-gray-400 px-1 mb-2">
            Everything here is injected into every agent&apos;s context on every message. Use it to describe your company, product, goals, strategy — anything the agents should always know.
          </p>
          <div className="bg-white rounded-apple-xl shadow-apple-sm overflow-hidden">
            <div className="px-4 py-3">
              <textarea
                value={profile.user_context}
                onChange={(e) => setProfile({ ...profile, user_context: e.target.value })}
                placeholder={`Example:\n## About My Company\nWe're building X, a Y for Z. Currently in [stage].\n\n## My Goals\n- Ship v1 by [date]\n- Land first paying customer\n\n## Key People\n- [Name]: [role]\n\n## Context Agents Should Know\n[Anything else relevant]`}
                rows={12}
                className="w-full text-sm text-apple-gray-700 bg-transparent focus:outline-none resize-none leading-relaxed placeholder:text-apple-gray-300"
              />
            </div>
            <div className="px-4 py-3 border-t border-apple-gray-100 flex items-center justify-between">
              <span className="text-xs text-apple-gray-400">
                {profile.user_context.length > 0
                  ? `${profile.user_context.length.toLocaleString()} chars`
                  : "Empty — agents will use their default context"}
              </span>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="px-4 py-2 bg-apple-gray-950 text-white text-sm font-medium rounded-apple-md hover:bg-apple-gray-800 disabled:opacity-50 transition-all"
              >
                {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider px-1 mb-2">
            Notifications
          </h2>
          <div className="bg-white rounded-apple-xl shadow-apple-sm overflow-hidden divide-y divide-apple-gray-100">
            {[
              "Email me when Alex flags something urgent",
              "Weekly summary",
            ].map((label) => (
              <div key={label} className="px-4 py-3.5 flex items-center justify-between">
                <span className="text-sm text-apple-gray-700">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-apple-gray-400 bg-apple-gray-100 px-2 py-0.5 rounded-full">
                    Coming Soon
                  </span>
                  <div className="w-10 h-6 bg-apple-gray-200 rounded-full opacity-40 cursor-not-allowed" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Billing */}
        <section>
          <h2 className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider px-1 mb-2">
            Billing
          </h2>
          <div className="bg-white rounded-apple-xl shadow-apple-sm overflow-hidden divide-y divide-apple-gray-100">
            <div className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-sm text-apple-gray-700">Current plan</span>
              <span className="text-sm font-medium text-apple-gray-950 bg-apple-gray-100 px-2.5 py-1 rounded-full">
                Free
              </span>
            </div>
            <div className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-sm text-apple-gray-700">Messages this month</span>
              <span className="text-sm font-medium text-apple-gray-950">{messageCount}</span>
            </div>
            <div className="px-4 py-3.5">
              <button
                disabled
                className="w-full py-2.5 bg-apple-gray-100 text-apple-gray-400 text-sm font-medium rounded-apple-md cursor-not-allowed flex items-center justify-center gap-2"
              >
                Upgrade to Pro
                <span className="text-xs bg-apple-gray-200 px-2 py-0.5 rounded-full text-apple-gray-500">
                  Coming Soon
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider px-1 mb-2">
            Account
          </h2>
          <div className="bg-white rounded-apple-xl shadow-apple-sm overflow-hidden divide-y divide-apple-gray-100">
            <div className="px-4 py-3.5 flex items-center justify-between">
              <span className="text-sm text-apple-gray-500">Email</span>
              <span className="text-sm text-apple-gray-700">{email}</span>
            </div>
            <button
              onClick={() => showToast("Coming soon")}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-apple-gray-50 transition-colors text-left"
            >
              <span className="text-sm text-apple-gray-700">Change Password</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-apple-gray-400">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => setShowFeedback(true)}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-apple-gray-50 transition-colors text-left"
            >
              <span className="text-sm text-apple-gray-700">Give Feedback</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-apple-gray-400">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-red-50 transition-colors text-left"
            >
              <span className="text-sm text-red-500">Sign Out</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-red-400">
                <path d="M6 3H4a1 1 0 00-1 1v8a1 1 0 001 1h2M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-apple-gray-950 text-white text-sm px-4 py-2.5 rounded-full shadow-apple-lg animate-fade-in">
          {toast}
        </div>
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
}
