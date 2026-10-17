import { useTranslation } from "react-i18next";
import { Baby, HeartPulse, Leaf, Pill, ShieldCheck, Thermometer, Zap } from "lucide-react";

const PRESETS = [
  {
    id: "cat-flu",
    name: "Shamollash va gripp",
    shortName: "Shamollash",
    slugs: ["shamollash"],
    Icon: Thermometer,
    color: "#ef4444",
  },
  {
    id: "cat-stomach",
    name: "Oshqozon muammolari",
    shortName: "Oshqozon",
    slugs: ["oshqozon"],
    Icon: Pill,
    color: "#f59e0b",
  },
  {
    id: "cat-cardio",
    name: "Yurak va qon bosimi",
    shortName: "Yurak",
    slugs: ["yurak"],
    Icon: HeartPulse,
    color: "#dc2626",
  },
  {
    id: "cat-pain",
    name: "Og'riq qoldiruvchi",
    shortName: "Og'riq",
    slugs: ["ogriq"],
    Icon: Zap,
    color: "#8b5cf6",
  },
  {
    id: "cat-vitamin",
    name: "Vitaminlar va immunitet",
    shortName: "Vitamin",
    slugs: ["vitaminlar"],
    Icon: ShieldCheck,
    color: "#10b981",
  },
  {
    id: "cat-allergy",
    name: "Allergiya vositalari",
    shortName: "Allergiya",
    slugs: ["allergiya"],
    Icon: Leaf,
    color: "#059669",
  },
  {
    id: "cat-antibiotic",
    name: "Antibiotiklar",
    shortName: "Antibiotik",
    slugs: ["antibiotiklar"],
    Icon: Pill,
    color: "#087b51",
  },
  {
    id: "cat-kids",
    name: "Bolalar",
    shortName: "Bolalar",
    slugs: ["bolalar"],
    Icon: Baby,
    color: "#0d9488",
  },
];

function resolveItems(categories = []) {
  return categories.map((category) => {
    const slug = String(category.slug || "").toLowerCase();
    const name = String(category.name || "").toLowerCase();
    const preset =
      PRESETS.find((item) => item.id === category.id) ||
      PRESETS.find((item) => item.slugs.includes(slug)) ||
      PRESETS.find((item) => name.includes(item.shortName.toLowerCase())) ||
      PRESETS.find((item) => name.includes(item.name.toLowerCase().split(" ")[0]));

    return {
      id: category.id,
      presetId: preset?.id || "",
      name: category.name || preset?.name || "",
      shortName: preset?.shortName || category.name || "",
      Icon: preset?.Icon || Pill,
      color: preset?.color || "#087b51",
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
    </button>
  );
}

export default function CategoryBar({ categories = [], activeId, onSelect }) {
  const { t } = useTranslation();
  const items = resolveItems(categories).map((item) => {
    if (!item.presetId) {
      return {
        ...item,
        name: item.name || t("category.other"),
        shortName: item.shortName || t("category.other"),
      };
    }
    const label = t(`category.${item.presetId}`);
    return { ...item, name: label, shortName: label };
  });
  if (!items.length) return null;

  return (
    <section className="min-w-0">
      <div className="hidden grid-cols-3 gap-3 md:grid lg:grid-cols-6 lg:gap-4">
        {items.map((category) => (
          <CategoryCard
            key={`desk-${category.id}`}
            category={category}
            active={activeId === category.id}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="-mx-3 flex gap-2.5 overflow-x-auto overscroll-x-contain px-3 pb-1 no-scrollbar md:hidden">
        {items.map((category) => (
          <CategoryCard
            key={`mob-${category.id}`}
            category={category}
            active={activeId === category.id}
            onSelect={onSelect}
            compact
          />
        ))}
      </div>
    </section>
  );
}
