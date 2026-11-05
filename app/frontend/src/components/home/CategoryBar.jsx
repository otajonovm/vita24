import { useTranslation } from "react-i18next";
import { LayoutGrid } from "lucide-react";
import { resolveCategoryVisual } from "../../lib/categoryIcons";

function localizedCategoryName(category, language) {
  const code = String(language || "uz");
  if (code.startsWith("ru") && category.nameRu) return category.nameRu;
  if (code === "uz-Cyrl" && category.nameUzCyrl) return category.nameUzCyrl;
  return category.nameUz || category.name || "";
}

function resolveItems(categories = []) {
  return categories.map((category) => {
    const visual = resolveCategoryVisual(category);
    const label = category.nameUz || category.name || "";
    return {
      id: category.id,
      name: label,
      nameUz: category.nameUz || "",
      nameUzCyrl: category.nameUzCyrl || "",
      nameRu: category.nameRu || "",
      shortName: label,
      medicineCount: category.medicineCount || 0,
      Icon: visual.Icon,
      color: visual.color,
    };
  });
}

function CategoryCard({ category, active, onSelect, compact = false }) {
  const Icon = category.Icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(category.id)}
      className={`border bg-white shadow-sm transition-all hover:border-[#087b51] hover:shadow-md ${
        compact
          ? "flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl p-2.5"
          : "rounded-2xl p-3 text-left"
      } ${active ? "border-[#087b51] shadow-md ring-1 ring-[#087b51]/30" : "border-slate-100"}`}
    >
      <span
        className={`grid place-items-center rounded-full bg-white shadow-sm ${
          compact ? "h-11 w-11" : "mb-3 h-12 w-12"
        }`}
        style={{ color: category.color }}
      >
        <Icon className={compact ? "h-6 w-6" : "h-7 w-7"} aria-hidden />
      </span>
      <span
        className={`font-bold text-slate-800 ${
          compact ? "line-clamp-2 text-center text-[10px] leading-tight" : "block text-sm"
        }`}
      >
        {compact ? category.shortName : category.name}
      </span>
      {!compact && category.medicineCount > 0 ? (
        <span className="mt-1 block text-xs font-semibold text-slate-400">{category.medicineCount}</span>
      ) : null}
    </button>
  );
}

export default function CategoryBar({ categories = [], activeId, onSelect }) {
  const { t, i18n } = useTranslation();
  const items = resolveItems(categories).map((item) => {
    const localized = localizedCategoryName(item, i18n.language);
    if (localized) return { ...item, name: localized, shortName: localized };
    return {
      ...item,
      name: item.name || t("category.other"),
      shortName: item.shortName || t("category.other"),
    };
  });

  const allChip = {
    id: "",
    name: t("home.allMedicines"),
    shortName: t("home.allMedicines"),
    medicineCount: 0,
    Icon: LayoutGrid,
    color: "#087b51",
  };

  const chips = [allChip, ...items];
  if (!items.length) return null;

  return (
    <section className="min-w-0">
      <div className="hidden grid-cols-3 gap-3 md:grid lg:grid-cols-6 lg:gap-4">
        {chips.map((category) => (
          <CategoryCard
            key={`desk-${category.id || "all"}`}
            category={category}
            active={String(activeId || "") === String(category.id || "")}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="-mx-3 flex gap-2.5 overflow-x-auto overscroll-x-contain px-3 pb-1 no-scrollbar md:hidden">
        {chips.map((category) => (
          <CategoryCard
            key={`mob-${category.id || "all"}`}
            category={category}
            active={String(activeId || "") === String(category.id || "")}
            onSelect={onSelect}
            compact
          />
        ))}
      </div>
    </section>
  );
}
