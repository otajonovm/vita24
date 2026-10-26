const BRAND = "#087B51";
const CANVAS = "#F8FAFC";

function safeCall(target, method, ...args) {
  if (target && typeof target[method] === "function") {
    try {
      return target[method](...args);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function webApp() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

function positiveInset(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export function initTelegramWebApp() {
  const app = webApp();
  if (!app) return false;

  safeCall(app, "ready");
  safeCall(app, "expand");
  safeCall(app, "setHeaderColor", BRAND);
  safeCall(app, "setBackgroundColor", CANVAS);
  safeCall(app, "disableVerticalSwipes");

  const applyInsets = () => {
    const top = positiveInset(app.safeAreaInset?.top ?? app.contentSafeAreaInset?.top);
    const bottom = positiveInset(app.safeAreaInset?.bottom ?? app.contentSafeAreaInset?.bottom);
    const root = document.documentElement;
    if (top > 0) root.style.setProperty("--tg-safe-top", `${top}px`);
    else root.style.removeProperty("--tg-safe-top");
    if (bottom > 0) root.style.setProperty("--tg-safe-bottom", `${bottom}px`);
    else root.style.removeProperty("--tg-safe-bottom");
  };

  applyInsets();
  document.documentElement.classList.add("is-tma");
  if (typeof app.onEvent === "function") {
    app.onEvent("viewportChanged", applyInsets);
    app.onEvent("safeAreaChanged", applyInsets);
  }
  return true;
}

let backHandler = null;

export function syncTelegramBackButton(visible, onBack) {
  const back = webApp()?.BackButton;
  if (!back) return () => {};
  if (backHandler) {
    safeCall(back, "offClick", backHandler);
    backHandler = null;
  }
  if (visible) {
    backHandler = () => onBack?.();
    safeCall(back, "onClick", backHandler);
    safeCall(back, "show");
  } else {
    safeCall(back, "hide");
  }
  return () => {
    if (backHandler) {
      safeCall(back, "offClick", backHandler);
      backHandler = null;
    }
    safeCall(back, "hide");
  };
}

export function setTelegramClosingConfirmation(enabled) {
  const app = webApp();
  if (!app) return;
  safeCall(app, enabled ? "enableClosingConfirmation" : "disableClosingConfirmation");
}

export function isTelegramFormField(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const type = String(el.type || "text").toLowerCase();
  return !["checkbox", "radio", "button", "submit", "file", "range", "color", "hidden", "search", "image"].includes(type);
}
