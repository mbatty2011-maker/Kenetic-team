import Link from "next/link";

export default function CancelPage() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-black px-4">
      <div className="border border-white p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 border border-white flex items-center justify-center mx-auto mb-6">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="8.5" stroke="white" strokeWidth="1.6" />
            <path
              d="M11 7.5v4M11 14.5h.01"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h1 className="text-white text-sm font-bold uppercase tracking-widest mb-3"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}>
          No Worries
        </h1>
        <p className="text-white/50 text-xs mb-8"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}>
          You weren&apos;t charged. Come back whenever you&apos;re ready to upgrade.
        </p>

        <Link
          href="/pricing"
          className="block w-full py-3 border border-white text-white text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-colors duration-200 text-center mb-3"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          View Plans
        </Link>
        <Link
          href="/chat"
          className="block text-xs text-white/40 hover:text-white transition-colors"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
