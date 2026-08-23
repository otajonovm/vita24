import { useEffect } from "react";
import { initTelegramWebApp } from "../../lib/telegram";

export default function TelegramWebApp({ children }) {
  useEffect(() => {
    initTelegramWebApp();
  }, []);

  return children;
}
