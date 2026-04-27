"use client";

import Link from "next/link";

const UPGRADE_PATH: Record<string, { name: string; price: number; benefit: string }> = {
  free:    { name: "Solo",    price: 79,  benefit: "100 messages/agent, 90-day memory, and file generation" },
  solo:    { name: "Startup", price: 199, benefit: "unlimited messages, 1-year memory, and priority support" },
  startup: { name: "Scale",   price: 499, benefit: "team seats and unlimited everything" },
};

interface Props {
  reason: string;
  limitHit: string;
  tier: string;
  onDismiss: () => void;
}

export default function UpgradePrompt({ reason, limitHit, tier, onDismiss }: Props) {
  const upgrade = UPGRADE_PATH[tier];
  const monoStyle = { fontFamily: "var(--font-space-mono), monospace" };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
      <div className="bg-black border border-white max-w-sm w-full p-6">
        <div className="w-12 h-12 border border-white flex items-center justify-center mx-auto mb-5">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 7v4M11 14.5h.01" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="11" cy="11" r="9.5" stroke="white" strokeWidth="1.6" />
          </svg>
        </div>

        <h2
          className="text-white text-sm font-bold uppercase tracking-widest text-center mb-1"
          style={monoStyle}
        >
          {reason}
        </h2>
        <p className="text-white/50 text-xs text-center mb-1" style={monoStyle}>{limitHit}</p>

        {upgrade ? (
          <p className="text-white/50 text-xs text-center mb-6" style={monoStyle}>
            Upgrade to{" "}
            <span className="text-white font-bold">
              {upgrade.name} (${upgrade.price}/mo)
            </span>{" "}
            for {upgrade.benefit}.
          </p>
        ) : (
          <p className="text-white/50 text-xs text-center mb-6" style={monoStyle}>
            View your plan options to continue.
          </p>
        )}

        <Link
          href="/pricing"
          onClick={onDismiss}
          className="block w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 text-center mb-2"
          style={monoStyle}
        >
          Upgrade Now
        </Link>
        <button
          onClick={onDismiss}
          className="block w-full py-2.5 text-white/40 text-xs hover:text-white transition-colors"
          style={monoStyle}
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}
