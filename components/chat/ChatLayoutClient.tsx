"use client";

import { useState } from "react";
import { User } from "@supabase/supabase-js";
import Sidebar from "@/components/chat/Sidebar";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function ChatLayoutClient({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed md:relative z-30 md:z-auto
          h-full flex-shrink-0
          transition-transform duration-300 ease-apple
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{ width: "240px" }}
      >
        <Sidebar user={user} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center px-4 py-3 bg-black border-b border-white">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 border border-white text-white hover:bg-white hover:text-black transition-colors duration-200"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="1.5" fill="currentColor" />
              <rect x="2" y="8.25" width="14" height="1.5" fill="currentColor" />
              <rect x="2" y="12.5" width="14" height="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>

        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
    </div>
  );
}
