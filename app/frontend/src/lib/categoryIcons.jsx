import { Baby, HeartPulse, Leaf, Pill, Sparkles, Thermometer, Zap } from "lucide-react";

export const CATEGORY_ICON_MAP = {
  thermometer: Thermometer,
  heart: HeartPulse,
  zap: Zap,
  sparkles: Sparkles,
  baby: Baby,
  leaf: Leaf,
  shamollash: Thermometer,
  yurak: HeartPulse,
  ogriq: Zap,
  vitaminlar: Sparkles,
  bolalar: Baby,
  allergiya: Leaf,
};

export function CategoryIcon({ name, className = "h-5 w-5" }) {
  const Icon = CATEGORY_ICON_MAP[name] || Pill;
  return <Icon className={className} strokeWidth={1.8} />;
}

export function branchShortLabel(branch) {
  if (!branch) return "Manzilni tanlang";
  const place = branch.shortLabel || branch.district || branch.name;
  return `${branch.city || "Toshkent"}, ${place}`;
}
