"use client";

import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <p className="text-sm font-medium text-[#1C1C1E]">Something went wrong</p>
          <p className="text-xs text-[#1C1C1E]/50 max-w-xs">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs px-4 py-2 bg-[#1C1C1E] text-white rounded-full hover:bg-black transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
