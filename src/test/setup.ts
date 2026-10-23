import "@testing-library/jest-dom";

// Radix UI (Select, Dropdown, etc.) calls these during open/scroll-into-view;
// jsdom doesn't implement either, so without a no-op stub any test that
// actually interacts with a Radix popover throws "not implemented".
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
