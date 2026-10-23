import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The Catalog incident (a null product name crashing `.localeCompare`, with
 * nothing anywhere to catch it) unmounted the *entire* app - header and
 * sidebar included - because React 18 has no default error boundary of its
 * own. This is the general fix: a reusable boundary with a branded fallback,
 * used at two levels (see App.tsx and AppLayout.tsx):
 *
 *  - An outer boundary around the whole app, for anything that breaks before
 *    or outside the authenticated shell (auth/public routes, provider setup).
 *  - A per-route boundary inside AppLayout's <main>, keyed by the current
 *    pathname, so a crash in one page's content leaves the sidebar, header,
 *    and navigation fully alive - the person can click anywhere else in the
 *    app to recover, not just retry the same broken page. The pathname key
 *    guarantees a fresh boundary (no stale error state) on every navigation.
 */

interface Props {
  children: ReactNode;
  /** "app" gets a full-page fallback with a hard reload action (nothing else
   *  is known to be trustworthy at that level). "page" gets a lighter
   *  fallback with a "Try again" that just re-renders, since the shell
   *  around it is already known to be fine. */
  level?: "app" | "page";
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Real diagnostics stay in the console (and whatever log aggregation
    // reads it) - never shown in the fallback UI itself, per the "don't
    // expose error details to end users" requirement.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const level = this.props.level ?? "page";
    return (
      <div className={level === "app" ? "min-h-screen flex items-center justify-center bg-background p-6" : "flex items-center justify-center py-20 px-6"}>
        <div className="max-w-sm text-center space-y-4">
          <div className="mx-auto h-11 w-11 rounded-full border border-destructive/30 bg-destructive/[0.06] flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-serif text-xl">
              {level === "app" ? "Something went wrong" : "This page hit a problem"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {level === "app"
                ? "The app ran into an unexpected error. Reloading usually fixes it."
                : "The rest of the portal is fine - you can try again, or use the sidebar to go somewhere else."}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            {level === "app" ? (
              <Button onClick={() => window.location.reload()}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reload
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => this.setState({ error: null })}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Try again
                </Button>
                <Button onClick={() => { window.location.href = "/"; }}>
                  <Home className="h-3.5 w-3.5 mr-1.5" /> Go home
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}
