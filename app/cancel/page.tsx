import Link from "next/link";

export default function CancelPage() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-apple-gray-50 px-4">
      <div className="bg-white rounded-apple-xl shadow-apple-md p-8 max-w-sm w-full text-center animate-fade-in">
        <div className="w-14 h-14 rounded-full bg-apple-gray-100 flex items-center justify-center mx-auto mb-5">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="8.5" stroke="#8E8E93" strokeWidth="1.6" />
            <path
              d="M11 7.5v4M11 14.5h.01"
              stroke="#8E8E93"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-apple-gray-950 mb-2">No worries</h1>
        <p className="text-sm text-apple-gray-500 mb-6">
          You weren&apos;t charged. Come back whenever you&apos;re ready to upgrade.
        </p>

        <Link
          href="/pricing"
          className="block w-full py-2.5 bg-apple-gray-100 text-apple-gray-950 text-sm font-medium rounded-apple-md hover:bg-apple-gray-200 transition-colors text-center mb-3"
        >
          View Plans
        </Link>
        <Link
          href="/chat"
          className="block text-sm text-apple-gray-400 hover:text-apple-gray-600 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
