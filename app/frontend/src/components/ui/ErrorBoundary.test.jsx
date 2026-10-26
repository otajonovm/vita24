import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import ErrorBoundary, { isChunkLoadError } from "./ErrorBoundary";

function Boom() {
  throw new Error("sinov xatosi");
}

describe("ErrorBoundary", () => {
  it("shows a recovery screen instead of a blank page", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(createElement(ErrorBoundary, null, createElement(Boom)));
    });
    expect(container.textContent).toContain("Nimadir xato ketdi");
    expect(container.textContent).toContain("Sahifani yangilash");
    act(() => root.unmount());
    container.remove();
    spy.mockRestore();
  });

  it("detects lazy chunk load failures", () => {
    expect(isChunkLoadError({ name: "ChunkLoadError", message: "Loading chunk 3 failed" })).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("odd iy xato"))).toBe(false);
  });
});
