import {
  Flower2,
  HeartPulse,
  Leaf,
  Pill,
  Thermometer,
  Utensils,
} from "lucide-react";

export const CATEGORY_ICON_MAP = {
  thermometer: Thermometer,
  utensils: Utensils,
  flower: Flower2,
  pill: Pill,
  leaf: Leaf,
  heart: HeartPulse,
  shamollash: Thermometer,
  oshqozon: Utensils,
  allergiya: Flower2,
  ogriq: Pill,
  vitaminlar: Leaf,
  yurak: HeartPulse,
};

export function CategoryIcon({ name, className = "h-5 w-5" }) {
  const Icon = CATEGORY_ICON_MAP[name] || Pill;
  return <Icon className={className} strokeWidth={1.8} />;
}
