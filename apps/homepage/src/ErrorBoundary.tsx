import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-dark text-text-light font-sans text-center p-8">
          <h1 className="text-2xl mb-4">Something went wrong</h1>
          <p className="text-text-muted mb-6">
            An unexpected error occurred. Please reload the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-xl border border-brand/30 bg-brand/10 px-6 py-2.5 text-sm text-text-light transition-colors hover:border-brand/50 hover:bg-brand/20"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
