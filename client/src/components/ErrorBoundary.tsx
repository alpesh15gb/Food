import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // MP-008: beacon production crashes (no PII — message + route only).
    try {
      const payload = JSON.stringify({
        message: String(error?.message ?? "unknown").slice(0, 500),
        route: typeof window !== "undefined" ? window.location.pathname.slice(0, 200) : "",
      });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/client-errors", payload);
      else fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }).catch(() => undefined);
    } catch { /* never break the fallback UI */ }
  }

  render() {
    if (this.state.hasError) {
      const isDev = typeof import.meta !== "undefined" && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Something went wrong in the kitchen display.</h2>
            <p className="mb-6 text-sm text-muted-foreground">Please reload the page. If this keeps happening, contact support with the time it occurred.</p>

            {isDev && (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
                <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                  {this.state.error?.stack}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
