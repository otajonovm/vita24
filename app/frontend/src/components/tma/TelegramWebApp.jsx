import { useEffect } from "react";
import { initTelegramWebApp } from "../../lib/telegram";
import { loginWithTelegramWebApp } from "../../services/api";
import { useAuthStore } from "../../store/useAuthStore";

function isStaffPath() {
  const path = typeof window !== "undefined" ? window.location.pathname || "" : "";
  return path.startsWith("/admin") || path.startsWith("/branch-admin");
}

function tryTelegramLogin() {
  if (typeof window === "undefined" || isStaffPath()) return;
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) return;
  const { isAuthenticated } = useAuthStore.getState();
  if (isAuthenticated) return;
  useAuthStore.getState().setTelegramAuthPending(true);
  loginWithTelegramWebApp(initData)
    .then((session) => {
      if (!session?.token || !session?.user) return;
      if (useAuthStore.getState().isAuthenticated) return;
      useAuthStore.getState().setSession(session.user, session.token);
    })
    .catch(() => {})
    .finally(() => {
      useAuthStore.getState().setTelegramAuthPending(false);
    });
}

export default function TelegramWebApp({ children }) {
  useEffect(() => {
    initTelegramWebApp();
    const persist = useAuthStore.persist;
    if (!persist?.onFinishHydration) {
      tryTelegramLogin();
      return undefined;
    }
    if (persist.hasHydrated()) tryTelegramLogin();
    return persist.onFinishHydration(() => tryTelegramLogin());
  }, []);

  return children;
}
