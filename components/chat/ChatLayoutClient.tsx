"use client";

import { useState } from "react";
import { User } from "@supabase/supabase-js";
import Sidebar from "@/components/chat/Sidebar";
import NewTaskModal from "@/components/chat/NewTaskModal";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function ChatLayoutClient({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-apple-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
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
        <Sidebar user={user} onClose={() => setSidebarOpen(false)} onNewTask={() => setShowNewTask(true)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center px-4 py-3 bg-white border-b border-apple-gray-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-apple-md hover:bg-apple-gray-50 active:bg-apple-gray-100 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="#1C1C1E" />
              <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="#1C1C1E" />
              <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="#1C1C1E" />
            </svg>
          </button>
        </div>

        <ErrorBoundary>{children}</ErrorBoundary>
      </div>

      {/* Task modal rendered at root level — outside the CSS-transformed sidebar container
          so that its fixed positioning is relative to the viewport, not the 240px sidebar */}
      {showNewTask && <NewTaskModal onClose={() => setShowNewTask(false)} />}
    </div>
  );
}
