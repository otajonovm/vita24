import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAsync } from "./useAsync";

function HookProbe({ fetcher, deps, options, onRender }) {
  const state = useAsync(fetcher, deps, options);
  onRender(state);
  return null;
}

function mount(fetcher, deps = [], options) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest;
  const onRender = (state) => {
    latest = state;
  };
  act(() => {
    root.render(createElement(HookProbe, { fetcher, deps, options, onRender }));
  });
  return {
    get: () => latest,
    rerender: (nextFetcher = fetcher, nextDeps = deps, nextOptions = options) => {
      act(() => {
        root.render(createElement(HookProbe, { fetcher: nextFetcher, deps: nextDeps, options: nextOptions, onRender }));
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useAsync", () => {
  it("keeps the latest response when an older request finishes later", async () => {
    let resolveFirst;
    let resolveSecond;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    const calls = [];
    const fetcher = ({ signal }) => {
      const id = calls.length;
      calls.push(signal);
      return id === 0 ? first : second;
    };

    const view = mount(fetcher, [1]);
    await act(async () => {});
    expect(view.get().loading).toBe(true);

    view.rerender(fetcher, [2]);
    await act(async () => {});

    await act(async () => {
      resolveSecond("yangisi");
      await second;
    });
    expect(view.get().data).toBe("yangisi");
    expect(view.get().loading).toBe(false);

    await act(async () => {
      resolveFirst("eskisi");
      await first;
    });
    expect(view.get().data).toBe("yangisi");
    view.unmount();
  });

  it("aborts the previous request on unmount", async () => {
    let seenSignal;
    const fetcher = ({ signal }) => {
      seenSignal = signal;
      return new Promise(() => {});
    };
    const view = mount(fetcher, []);
    await act(async () => {});
    expect(seenSignal.aborted).toBe(false);
    view.unmount();
    expect(seenSignal.aborted).toBe(true);
  });
});
