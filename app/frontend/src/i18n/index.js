import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";
import uz from "./locales/uz.json";
import uzCyrl from "./locales/uz-Cyrl.json";

const saved = localStorage.getItem("vita24-lang") || "uz";

const dev = import.meta.env.DEV;

i18n.use(initReactI18next).init({
  resources: {
    uz: { translation: uz },
    "uz-Cyrl": { translation: uzCyrl },
    ru: { translation: ru },
  },
  lng: saved,
  fallbackLng: "uz",
  interpolation: { escapeValue: false },
  saveMissing: dev,
  missingKeyHandler(languages, _namespace, key) {
    if (!dev) return;
    const lang = Array.isArray(languages) ? languages.join(", ") : languages;
    console.warn(`[i18n] tarjima kaliti topilmadi: ${key} (${lang})`);
  },
});

export function setLanguage(code) {
  i18n.changeLanguage(code);
  localStorage.setItem("vita24-lang", code);
  document.documentElement.lang = code === "ru" ? "ru" : "uz";
}

export default i18n;
