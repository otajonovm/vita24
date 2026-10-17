import { useTranslation } from "react-i18next";
import { setLanguage } from "../../i18n";

const OPTIONS = [
  { id: "uz", short: "UZ", label: "O'zbek lotin" },
  { id: "uz-Cyrl", short: "ЎЗ", label: "Ўзбек кирилл" },
  { id: "ru", short: "RU", label: "Русский" },
];

export default function LanguageSwitcher({ full = false }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={`inline-flex rounded-xl border border-slate-200 p-0.5 ${full ? "flex-wrap" : ""}`} role="group" aria-label={t("settings.language")}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={i18n.language === option.id}
          onClick={() => setLanguage(option.id)}
          className={`h-8 rounded-lg px-2 text-xs font-bold ${
            i18n.language === option.id ? "bg-[#087B51] text-white" : "text-slate-600"
          }`}
        >
          {full ? option.label : option.short}
        </button>
      ))}
    </div>
  );
}
