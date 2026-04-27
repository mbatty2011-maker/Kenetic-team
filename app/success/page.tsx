import Link from "next/link";

export default function SuccessPage() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-apple-gray-50 px-4">
      <div className="bg-white rounded-apple-xl shadow-apple-md p-8 max-w-sm w-full text-center animate-fade-in">
        <div className="w-14 h-14 rounded-full bg-apple-gray-950 flex items-center justify-center mx-auto mb-5">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12L9.5 16.5L19 8"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-apple-gray-950 mb-2">
          You&apos;re all set
        </h1>
        <p className="text-sm text-apple-gray-500 mb-6">
          Your subscription is active. Your AI executive team is ready to work.
        </p>

        <Link
          href="/chat"
          className="block w-full py-2.5 bg-apple-gray-950 text-white text-sm font-medium rounded-apple-md hover:bg-apple-gray-800 transition-colors text-center"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
