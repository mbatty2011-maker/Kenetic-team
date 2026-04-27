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

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-apple-xl shadow-apple-xl max-w-sm w-full p-6">
        <div className="w-12 h-12 rounded-full bg-apple-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M11 7v4M11 14.5h.01"
              stroke="#8E8E93"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="11" cy="11" r="9.5" stroke="#8E8E93" strokeWidth="1.6" />
          </svg>
        </div>

        <h2 className="text-base font-semibold text-apple-gray-950 text-center mb-1">
          {reason}
        </h2>
        <p className="text-sm text-apple-gray-500 text-center mb-1">{limitHit}</p>

        {upgrade ? (
          <p className="text-sm text-apple-gray-500 text-center mb-5">
            Upgrade to{" "}
            <span className="font-medium text-apple-gray-700">
              {upgrade.name} (${upgrade.price}/mo)
            </span>{" "}
            for {upgrade.benefit}.
          </p>
        ) : (
          <p className="text-sm text-apple-gray-500 text-center mb-5">
            View your plan options to continue.
          </p>
        )}

        <Link
          href="/pricing"
          onClick={onDismiss}
          className="block w-full py-2.5 bg-apple-gray-950 text-white text-sm font-medium rounded-apple-md hover:bg-apple-gray-800 transition-colors text-center mb-2"
        >
          Upgrade Now
        </Link>
        <button
          onClick={onDismiss}
          className="block w-full py-2.5 text-apple-gray-400 text-sm hover:text-apple-gray-600 transition-colors"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}
