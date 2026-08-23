import { Baby, HeartPulse, Leaf, Sparkles, Thermometer, Zap } from "lucide-react";

const DISPLAY_CATEGORIES = [
  { id: "cat-flu", name: "Shamollash", Icon: Thermometer },
  { id: "cat-cardio", name: "Yurak", Icon: HeartPulse },
  { id: "cat-pain", name: "Og'riq qoldiruvchi", Icon: Zap },
  { id: "cat-vitamin", name: "Vitaminlar", Icon: Sparkles },
  { id: "cat-kids", name: "Bolalar", Icon: Baby },
  { id: "cat-allergy", name: "Allergiya", Icon: Leaf },
];

export default function CategoryBar({ categories = [], activeId, onSelect }) {
  const items =
    categories.length > 0
      ? DISPLAY_CATEGORIES.map((preset) => {
          const match = categories.find((item) => item.id === preset.id);
          return { ...preset, id: match?.id || preset.id, name: match?.name || preset.name };
        })
      : DISPLAY_CATEGORIES;

  return (
    <section>
      <div className="hidden grid-cols-3 gap-3 md:grid lg:grid-cols-6 lg:gap-4">
        {items.map((category) => {
          const active = activeId === category.id;
          const Icon = category.Icon;
          return (
            <button
              key={`desk-${category.id}`}
              type="button"
              onClick={() => onSelect(category.id)}
              className={`rounded-2xl border p-4 text-left shadow-sm ${
                active ? "border-brand bg-brand-soft" : "border-slate-100 bg-white"
              }`}
            >
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-white text-brand">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="block text-sm font-bold text-slate-800">{category.name}</span>
            </button>
          );
        })}
      </div>

      <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 no-scrollbar md:hidden">
        {items.map((category) => {
          const active = activeId === category.id;
          const Icon = category.Icon;
          return (
            <button
              key={`mob-${category.id}`}
              type="button"
              onClick={() => onSelect(category.id)}
              className="w-[72px] shrink-0 text-center"
            >
              <span
                className={`mx-auto grid h-14 w-14 place-items-center rounded-full border shadow-sm ${
                  active ? "border-brand bg-brand-soft text-brand" : "border-slate-100 bg-white text-brand-dark"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="mt-1.5 block text-[11px] font-semibold leading-tight text-slate-700">
                {category.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
