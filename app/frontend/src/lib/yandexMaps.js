const API_KEY = import.meta.env.VITE_YANDEX_MAPS_KEY || "";

export function loadYandexMaps() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window mavjud emas"));
  }
  if (window.ymaps) {
    return new Promise((resolve) => window.ymaps.ready(() => resolve(window.ymaps)));
  }
  if (window.__vitaYmapsPromise) return window.__vitaYmapsPromise;

  window.__vitaYmapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      lang: "uz_UZ",
      load: "package.full",
    });
    if (API_KEY) params.set("apikey", API_KEY);
    script.src = `https://api-maps.yandex.ru/2.1/?${params.toString()}`;
    script.async = true;
    script.onload = () => {
      if (!window.ymaps) {
        reject(new Error("Yandex Maps yuklanmadi"));
        return;
      }
      window.ymaps.ready(() => resolve(window.ymaps));
    };
    script.onerror = () => reject(new Error("Yandex Maps script xatosi"));
    document.head.appendChild(script);
  });

  return window.__vitaYmapsPromise;
}
