import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render failed", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--base)] p-6">
        <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-6">
          <div className="font-ui text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--overlay-1)]">
            App error
          </div>
          <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[var(--text)]">
            This screen crashed during render
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-[var(--subtext-0)]">
            The app caught the runtime error instead of blanking the window. Reload the app and retry.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--base)] p-4 text-[12px] text-[var(--subtext-0)]">
            {this.state.error.message}
          </pre>
          <div className="mt-5">
            <Button onClick={() => window.location.reload()}>Reload app</Button>
          </div>
        </div>
      </div>
    );
  }
}
