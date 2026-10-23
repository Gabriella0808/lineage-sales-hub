import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

// Phase 3A: the Catalog incident (a single bad data value crashed the whole
// app, sidebar and header included, because nothing anywhere caught it) is
// the reason this exists. These tests cover the two things that actually
// matter: the fallback renders instead of a blank screen, and - the real
// regression target - a page-level boundary does NOT take down sibling
// chrome (the sidebar/header) the way the original incident did.

function Bomb(): JSX.Element {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // React logs the caught error to console.error itself (on top of this
    // component's own componentDidCatch log) - expected noise, silenced so
    // test output stays readable; still a real console.error call either way.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    render(<ErrorBoundary><p>All good</p></ErrorBoundary>);
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("shows a branded page-level fallback (not a blank screen) when a child throws", () => {
    render(<ErrorBoundary level="page"><Bomb /></ErrorBoundary>);
    expect(screen.getByText("This page hit a problem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
  });

  it("does not expose the raw error message in the fallback UI", () => {
    render(<ErrorBoundary level="page"><Bomb /></ErrorBoundary>);
    expect(screen.queryByText(/boom/i)).not.toBeInTheDocument();
  });

  it("logs the real error for diagnostics even though the UI doesn't show it", () => {
    render(<ErrorBoundary level="page"><Bomb /></ErrorBoundary>);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ErrorBoundary]",
      expect.objectContaining({ message: "boom" }),
      expect.any(String),
    );
  });

  it("shows the app-level fallback with a Reload action, not Try again", () => {
    render(<ErrorBoundary level="app"><Bomb /></ErrorBoundary>);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("'Try again' re-renders children once the error condition is gone", () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("boom");
      return <p>Recovered</p>;
    }
    render(<ErrorBoundary level="page"><Flaky /></ErrorBoundary>);
    expect(screen.getByText("This page hit a problem")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it("REGRESSION: a page-level boundary isolates the crash - sibling shell content (sidebar/header) stays mounted", () => {
    // Mirrors AppLayout's real structure: sidebar and header are siblings of
    // the boundary, not children of it, so they must survive a page crash.
    render(
      <div>
        <nav>Sidebar nav - Digital Assets, Product Catalog, Cart</nav>
        <header>Top header</header>
        <main>
          <ErrorBoundary level="page"><Bomb /></ErrorBoundary>
        </main>
      </div>,
    );
    // The crashing page shows its fallback, not a blank page...
    expect(screen.getByText("This page hit a problem")).toBeInTheDocument();
    // ...and critically, everything outside the boundary is still there -
    // the exact thing that did NOT happen in the real Catalog incident.
    expect(screen.getByText(/sidebar nav/i)).toBeInTheDocument();
    expect(screen.getByText("Top header")).toBeInTheDocument();
  });
});
