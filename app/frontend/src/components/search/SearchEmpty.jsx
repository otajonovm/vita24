import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import MedicineCard from "../cards/MedicineCard";
import { peekPublicSettings, loadPublicSettings } from "../../lib/publicSettings";
import { suggestMedicines } from "../../services/api";
import { useBranchStore } from "../../store/useBranchStore";

const EMPTY = [];

export default function SearchEmpty({
  suggestion,
  suggestions = EMPTY,
  popular = EMPTY,
  popularQueries: popularQueriesProp,
  categories = EMPTY,
  onSuggest,
  onCategory,
}) {
  const { t } = useTranslation();
  const branch = useBranchStore((state) => state.branch);
  const ideas = suggestions.length ? suggestions : suggestion ? [suggestion] : EMPTY;
  const [fetchedQueries, setFetchedQueries] = useState(EMPTY);
  const [settings, setSettings] = useState(() => peekPublicSettings());
  const popularQueries =
    Array.isArray(popularQueriesProp) && popularQueriesProp.length > 0 ? popularQueriesProp : fetchedQueries;

  useEffect(() => {
    let active = true;
    loadPublicSettings().then((data) => {
      if (active) setSettings(data);
    });
    // Prop bo'sh bo'lsa — bir marta API dan mashhur so'rovlarni olamiz.
    if (!(Array.isArray(popularQueriesProp) && popularQueriesProp.length > 0)) {
      suggestMedicines({ branchId: branch?.id, search: "" })
        .then((data) => {
          if (!active) return;
          const next = Array.isArray(data.popularQueries) ? data.popularQueries : EMPTY;
          setFetchedQueries((prev) => (prev === next || (prev.length === 0 && next.length === 0) ? prev : next));
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [branch?.id, popularQueriesProp]);

  const telegramUrl =
    settings?.telegramBotUrl || (settings?.telegramBotUsername ? `https://t.me/${settings.telegramBotUsername}` : "");
  const phone = settings?.contactPhone || settings?.contactPhoneAlt || "";

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-700">{t("search.none")}</p>
        {ideas.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onSuggest(name)}
            className="mt-2 block text-left text-sm font-bold text-[#087B51]"
          >
            {t("search.didYouMean", { name })}
          </button>
        ))}
        {categories.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("search.categories")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onCategory(category.id)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700"
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {popularQueries.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("search.popularQueries")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {popularQueries.slice(0, 8).map((item) => (
                <button
                  key={item.query || item}
                  type="button"
                  onClick={() => onSuggest(item.query || item)}
                  className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-[#087B51]"
                >
                  {item.query || item}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {telegramUrl ? (
            <a href={telegramUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#087B51] no-underline">
              {t("search.openTelegram")}
            </a>
          ) : null}
          {phone ? (
            <a href={`tel:${String(phone).replace(/\s/g, "")}`} className="text-sm font-bold text-slate-700 no-underline">
              {t("search.askPharmacist")}: {phone}
            </a>
          ) : (
            <p className="text-sm font-semibold text-slate-500">{t("search.askPharmacist")}</p>
          )}
        </div>
      </div>
      {popular.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-extrabold text-slate-900">{t("search.popular")}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {popular.map((medicine) => (
              <MedicineCard key={medicine.id} medicine={medicine} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
