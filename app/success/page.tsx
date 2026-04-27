import Link from "next/link";

export default function SuccessPage() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-black px-4">
      <div className="border border-white p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 border border-white flex items-center justify-center mx-auto mb-6 bg-white">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12L9.5 16.5L19 8"
              stroke="black"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="text-white text-sm font-bold uppercase tracking-widest mb-3"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}>
          You&apos;re All Set
        </h1>
        <p className="text-white/50 text-xs mb-8"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}>
          Your subscription is active. Your AI executive team is ready to work.
        </p>

        <Link
          href="/chat"
          className="block w-full py-3 bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white border border-white transition-colors duration-200 text-center"
          style={{ fontFamily: "var(--font-space-mono), monospace" }}
        >
          Go to Dashboard →
        </Link>
      </div>
    </div>
  );
}
