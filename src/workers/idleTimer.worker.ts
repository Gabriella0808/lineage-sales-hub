/// <reference lib="webworker" />

// Runs the idle/warning countdown on its own clock, inside a dedicated
// worker thread. The browser throttles (or near-fully suspends) setInterval
// on a page's main thread once its tab is backgrounded - that's exactly why
// a stuck "Still there?" dialog can't reliably finish counting down or sign
// out while the tab isn't visible. A dedicated worker's event loop is not
// subject to that same background-tab throttling, so the 1s tick here keeps
// firing on schedule whether or not the portal tab is the active one, and
// posts a message back the instant the real deadline is crossed.

type InitMsg = { type: "init"; idleTimeoutMs: number; warningMs: number; lastActivityAt: number };
type ActivityMsg = { type: "activity"; ts: number };
type StopMsg = { type: "stop" };
type InMsg = InitMsg | ActivityMsg | StopMsg;

let idleTimeoutMs = 30 * 60 * 1000;
let warningMs = 60 * 1000;
let lastActivityAt = Date.now();
let warningShown = false;
let timedOut = false;

function tick() {
  if (timedOut) return;
  const elapsed = Date.now() - lastActivityAt;
  if (elapsed >= idleTimeoutMs) {
    timedOut = true;
    self.postMessage({ type: "timeout" });
  } else if (elapsed >= idleTimeoutMs - warningMs) {
    warningShown = true;
    const secondsLeft = Math.max(0, Math.ceil((idleTimeoutMs - elapsed) / 1000));
    self.postMessage({ type: "warn", secondsLeft });
  } else if (warningShown) {
    warningShown = false;
    self.postMessage({ type: "clear-warning" });
  }
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "init") {
    idleTimeoutMs = msg.idleTimeoutMs;
    warningMs = msg.warningMs;
    lastActivityAt = msg.lastActivityAt;
    timedOut = false;
    warningShown = false;
  } else if (msg.type === "activity") {
    if (timedOut) return; // already signed out locally - a late activity message shouldn't resurrect it
    lastActivityAt = msg.ts;
  } else if (msg.type === "stop") {
    self.close();
  }
};

setInterval(tick, 1000);
