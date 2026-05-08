// PWA service worker registration with strict guards.
// Service workers must NEVER run inside iframes or Lovable preview hosts —
// they cause stale content and navigation interference.

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("preview--") ||
  host.endsWith("lovableproject.com") ||
  host.endsWith("lovableproject-dev.com") ||
  host === "localhost" ||
  host === "127.0.0.1";

export async function setupPWA() {
  if (isPreviewHost || isInIframe) {
    // Aggressively unregister any existing SWs in preview/iframe contexts.
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    return;
  }

  if (!("serviceWorker" in navigator)) return;

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch {
    // PWA module not available (dev mode) — safe to ignore.
  }
}
