import {
  Activity,
  Baby,
  Bone,
  Droplets,
  Eye,
  Flower2,
  HeartPulse,
  Leaf,
  Moon,
  Pill,
  Sparkles,
  Stethoscope,
  Thermometer,
  Zap,
} from "lucide-react";

export const CATEGORY_ICON_MAP = {
  thermometer: Thermometer,
  heart: HeartPulse,
  zap: Zap,
  sparkles: Sparkles,
  baby: Baby,
  leaf: Leaf,
  pill: Pill,
  droplet: Droplets,
  eye: Eye,
  flower: Flower2,
  moon: Moon,
  activity: Activity,
  bone: Bone,
  stethoscope: Stethoscope,
  stomach: Pill,
  "ogriq-isitma": Zap,
  ogriq: Zap,
  "shamollash-yotal": Thermometer,
  shamollash: Thermometer,
  antibiotiklar: Pill,
  "vitaminlar-bad": Sparkles,
  vitaminlar: Sparkles,
  "oshqozon-ichak": Pill,
  oshqozon: Pill,
  "yurak-qon": HeartPulse,
  yurak: HeartPulse,
  allergiya: Leaf,
  "teri-kremlar": Droplets,
  "kuz-quloq-burun": Eye,
  ayollar: Flower2,
  bolalar: Baby,
  "asab-uyqu": Moon,
  diabet: Activity,
  "bogim-mushak": Bone,
  "tibbiy-buyumlar": Stethoscope,
  boshqa: Pill,
};

export const CATEGORY_COLOR_MAP = {
  thermometer: "#ef4444",
  shamollash: "#ef4444",
  "shamollash-yotal": "#ef4444",
  heart: "#dc2626",
  yurak: "#dc2626",
  "yurak-qon": "#dc2626",
  zap: "#8b5cf6",
  ogriq: "#8b5cf6",
  "ogriq-isitma": "#8b5cf6",
  sparkles: "#10b981",
  vitaminlar: "#10b981",
  "vitaminlar-bad": "#10b981",
  leaf: "#059669",
  allergiya: "#059669",
  oshqozon: "#f59e0b",
  "oshqozon-ichak": "#f59e0b",
  bolalar: "#0d9488",
  baby: "#0d9488",
  antibiotiklar: "#087b51",
  pill: "#087b51",
  droplet: "#db2777",
  "teri-kremlar": "#db2777",
  eye: "#0284c7",
  "kuz-quloq-burun": "#0284c7",
  flower: "#c026d3",
  ayollar: "#c026d3",
  moon: "#6366f1",
  "asab-uyqu": "#6366f1",
  activity: "#ea580c",
  diabet: "#ea580c",
  bone: "#a16207",
  "bogim-mushak": "#a16207",
  stethoscope: "#475569",
  "tibbiy-buyumlar": "#475569",
  boshqa: "#64748b",
};

export function resolveCategoryVisual(category = {}) {
  const slug = String(category.slug || "").toLowerCase();
  const iconKey = String(category.icon || slug || "pill").toLowerCase();
  return {
    Icon: CATEGORY_ICON_MAP[iconKey] || CATEGORY_ICON_MAP[slug] || Pill,
    color: CATEGORY_COLOR_MAP[iconKey] || CATEGORY_COLOR_MAP[slug] || "#087b51",
  };
}

export function CategoryIcon({ name, className = "h-5 w-5", style }) {
  const Icon = CATEGORY_ICON_MAP[name] || Pill;
  const color = CATEGORY_COLOR_MAP[name] || "#087b51";
  return <Icon className={className} style={{ color, ...style }} aria-hidden />;
}

export function branchShortLabel(branch) {
  if (!branch) return "Manzilni tanlang";
  const place = branch.shortLabel || branch.district || branch.name;
  return `${branch.city || "Toshkent"}, ${place}`;
}
