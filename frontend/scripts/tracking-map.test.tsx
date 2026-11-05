import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
async function main() {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost:5173" },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    SVGElement: dom.window.SVGElement,
    getComputedStyle: dom.window.getComputedStyle,
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
    cancelAnimationFrame: clearTimeout,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", {
    get: () => 900,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientHeight", {
    get: () => 500,
  });
  (
    dom.window.SVGSVGElement.prototype as unknown as {
      createSVGRect: () => object;
    }
  ).createSVGRect = () => ({});
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.matchMedia = () =>
    ({
      matches: true,
      addListener() {},
      removeListener() {},
    }) as unknown as MediaQueryList;
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { TrackingMap } = await import("../src/modules/tracking/TrackingMap");
  const root = createRoot(document.getElementById("root")!);
  const marker = {
    id: "synthetic-session",
    latitude: 12.9,
    longitude: 77.6,
    registration: "<img src=x onerror=alert(1)>",
    vehicleCode: "SYNTHETIC",
    tripStatus: "DISPATCHED",
    gpsAt: new Date().toISOString(),
    speedKph: 20,
    heading: 40,
    mode: "SIMULATED" as const,
    style: "MOVING",
  };
  await act(async () => {
    root.render(<TrackingMap markers={[marker]} />);
  });
  let element = document.querySelector<HTMLElement>(
    '[data-session-id="synthetic-session"]',
  )!;
  assert.ok(element, "Recorded location creates Leaflet marker");
  const before = element.style.cssText;
  await act(async () => {
    root.render(
      <TrackingMap
        markers={[{ ...marker, latitude: 12.91, longitude: 77.61 }]}
      />,
    );
  });
  element = document.querySelector<HTMLElement>(
    '[data-session-id="synthetic-session"]',
  )!;
  assert.equal(element.dataset.latitude, "12.91");
  assert.equal(element.dataset.longitude, "77.61");
  assert.notEqual(
    element.style.cssText,
    before,
    "Leaflet marker position changes on the existing map",
  );
  assert.equal(
    document.querySelectorAll(".leaflet-container").length,
    1,
    "Map is retained between observations",
  );
  assert.equal(element.dataset.mode, "SIMULATED");
  assert.ok(element.querySelector(".fg-gps-dot--simulated"));
  assert.equal(
    element.querySelector("img"),
    null,
    "Provider text cannot inject markup",
  );
  await act(async () => {
    element.click();
  });
  assert.equal(
    document.querySelector(".leaflet-popup-content img"),
    null,
    "Popup uses escaped DOM text",
  );
  await act(async () => {
    root.render(<TrackingMap markers={[]} />);
  });
  assert.equal(
    document.querySelectorAll("[data-session-id]").length,
    0,
    "Empty source removes old markers",
  );
  assert.ok(
    document.body.textContent?.includes("No GPS coordinates available"),
    "No synthetic default position appears",
  );
  await act(async () => root.unmount());
  dom.window.close();
  console.log(
    "PASS 10 React/Leaflet map assertions: movement, stable map, provenance, safe popup and empty state",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
