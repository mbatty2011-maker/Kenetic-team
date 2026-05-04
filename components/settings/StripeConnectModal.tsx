"use client";

import { useState } from "react";

type ConnectResponse = {
  ok: true;
  account_label: string | null;
  livemode: boolean | null;
  restricted: boolean;
};

export default function StripeConnectModal({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [warning, setWarning] = useState("");

  async function submit() {
    const trimmed = apiKey.trim();
    if (!trimmed || status === "connecting") return;
    setStatus("connecting");
    setErrorMsg("");
    setWarning("");
    try {
      const res = await fetch("/api/integrations/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as ConnectResponse | { error?: string } | null;
      if (!res.ok) {
        const code = (data && "error" in data && data.error) || "connection_failed";
        throw new Error(code);
      }
      const ok = data as ConnectResponse;
      setStatus("connected");
      setApiKey("");
      if (!ok.restricted) {
        setWarning(
          "We accepted this key, but it's a full secret key. Consider creating a Stripe restricted key with read-only permissions for safety."
        );
      }
      onConnected();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(humanizeError(raw));
      setStatus("error");
    }
  }

  const monoStyle = { fontFamily: "var(--font-space-mono), monospace" };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80">
      <div className="bg-black border border-white w-full max-w-md overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white">
          <div>
            <h2 className="text-white font-bold text-sm uppercase tracking-widest" style={monoStyle}>
              Connect Stripe
            </h2>
            <p className="text-white/40 text-xs mt-0.5" style={monoStyle}>
              Read-only access for Jeremy
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 border border-white flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors duration-200"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {status === "connected" ? (
          <div className="px-5 py-8 text-center space-y-4">
            <div className="w-12 h-12 border border-white flex items-center justify-center mx-auto bg-white">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path
                  d="M5 11l4.5 4.5L17 7"
                  stroke="black"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p
              className="text-white font-bold text-sm uppercase tracking-widest"
              style={monoStyle}
            >
              Stripe connected
            </p>
            {warning && (
              <p className="text-yellow-400 border border-yellow-500/40 px-3 py-2 text-xs" style={monoStyle}>
                {warning}
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200"
              style={monoStyle}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="space-y-2 text-white/60 text-xs leading-relaxed" style={monoStyle}>
              <p>
                Paste a <strong className="text-white">Stripe restricted key</strong> with read-only access.
              </p>
              <ul className="list-disc list-inside space-y-1 text-white/40">
                <li>Jeremy will only call read endpoints (balance, customers, subscriptions, invoices).</li>
                <li>We never charge, refund, or modify your account.</li>
                <li>Your key is encrypted at rest and never sent to other services.</li>
              </ul>
              <p className="text-white/40">
                Create one in your{" "}
                <a
                  href="https://dashboard.stripe.com/apikeys/create"
                  target="_blank"
                  rel="noreferrer"
                  className="text-white underline hover:text-white/80"
                >
                  Stripe dashboard
                </a>
                .
              </p>
            </div>

            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="rk_live_… or sk_live_…"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              className="w-full px-3 py-3 bg-black border border-white text-white text-sm placeholder:text-white/30 focus:outline-none font-mono"
              style={monoStyle}
            />

            {status === "error" && (
              <p className="text-red-400 border border-red-500/40 px-3 py-2 text-xs" style={monoStyle}>
                {errorMsg}
              </p>
            )}

            <button
              onClick={submit}
              disabled={!apiKey.trim() || status === "connecting"}
              className="w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 disabled:opacity-30"
              style={monoStyle}
            >
              {status === "connecting" ? "Validating with Stripe…" : "Connect"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function humanizeError(raw: string): string {
  if (raw.startsWith("stripe_validation_failed")) {
    return "Stripe rejected this key. Double-check it has read access and isn't revoked.";
  }
  if (raw === "invalid_api_key_format") {
    return "That doesn't look like a Stripe API key. Keys start with rk_live_, rk_test_, sk_live_, or sk_test_.";
  }
  if (raw === "api_key_required") return "Please paste a Stripe API key.";
  if (raw === "store_failed") return "Couldn't save the key. Try again.";
  if (raw === "unauthorized") return "Sign in again before connecting Stripe.";
  return "Couldn't connect to Stripe. Try again.";
}
