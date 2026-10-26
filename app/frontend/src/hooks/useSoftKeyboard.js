import { useEffect, useState } from "react";

const TEXT_TYPES = new Set(["text", "search", "tel", "url", "email", "password", "number"]);

function isKeyboardField(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return TEXT_TYPES.has(String(el.type || "text").toLowerCase());
}

export default function useSoftKeyboard() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(isKeyboardField(document.activeElement));
    const onBlur = () => window.setTimeout(sync, 30);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onBlur);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", onBlur);
    };
  }, []);

  return open;
}
