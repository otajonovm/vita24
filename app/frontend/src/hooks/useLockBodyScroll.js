import { useEffect } from "react";

let locks = 0;
let scrollY = 0;

export default function useLockBodyScroll(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const body = document.body;
    if (locks === 0) {
      scrollY = window.scrollY || window.pageYOffset || 0;
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
    }
    locks += 1;
    return () => {
      locks = Math.max(0, locks - 1);
      if (locks !== 0) return;
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
