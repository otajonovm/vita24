import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import LoadingButton from "./LoadingButton";

function renderButton(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(LoadingButton, props, "Saqlash"));
  });
  return {
    button: container.querySelector("button"),
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("LoadingButton", () => {
  it("does not fire onClick twice while loading", () => {
    const onClick = vi.fn();
    const view = renderButton({ loading: true, loadingText: "Saqlanmoqda...", onClick });
    expect(view.button.disabled).toBe(true);
    expect(view.button.getAttribute("aria-busy")).toBe("true");
    expect(view.button.textContent).toContain("Saqlanmoqda...");
    act(() => {
      view.button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      view.button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).not.toHaveBeenCalled();
    view.unmount();
  });

  it("fires onClick once when idle", () => {
    const onClick = vi.fn();
    const view = renderButton({ loading: false, onClick });
    act(() => {
      view.button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
