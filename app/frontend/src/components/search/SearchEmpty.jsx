import { useTranslation } from "react-i18next";
import MedicineCard from "../cards/MedicineCard";

export default function SearchEmpty({ suggestion, popular = [], categories = [], onSuggest, onCategory }) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-700">{t("search.none")}</p>
        {suggestion ? (
          <button
            type="button"
            onClick={() => onSuggest(suggestion)}
            className="mt-2 text-left text-sm font-bold text-[#087B51]"
          >
            {t("search.didYouMean", { name: suggestion })}
          </button>
        ) : null}
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
