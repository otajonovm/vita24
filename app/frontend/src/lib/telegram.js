const BRAND = "#087B51";
const CANVAS = "#F8FAFC";

function safeCall(target, method, ...args) {
  if (target && typeof target[method] === "function") {
    target[method](...args);
  }
}

export function initTelegramWebApp() {
  const webApp = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
  if (!webApp) return false;

  safeCall(webApp, "ready");
  safeCall(webApp, "expand");
  safeCall(webApp, "setHeaderColor", BRAND);
  safeCall(webApp, "setBackgroundColor", CANVAS);
  safeCall(webApp, "enableClosingConfirmation");

  const applyInsets = () => {
    const nextTop = webApp.safeAreaInset?.top || webApp.contentSafeAreaInset?.top || 0;
    const nextBottom = webApp.safeAreaInset?.bottom || webApp.contentSafeAreaInset?.bottom || 0;
    document.documentElement.style.setProperty("--tg-safe-top", `${nextTop}px`);
    document.documentElement.style.setProperty("--tg-safe-bottom", `${nextBottom}px`);
  };

  applyInsets();
  document.documentElement.classList.add("is-tma");
  if (typeof webApp.onEvent === "function") {
    webApp.onEvent("viewportChanged", applyInsets);
    webApp.onEvent("safeAreaChanged", applyInsets);
  }
  return true;
}
