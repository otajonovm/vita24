import {
  LiaBoltSolid,
  LiaCapsulesSolid,
  LiaChildSolid,
  LiaHeartbeatSolid,
  LiaLeafSolid,
  LiaPillsSolid,
  LiaShieldAltSolid,
  LiaTemperatureHighSolid,
} from "react-icons/lia";

export const CATEGORY_ICON_MAP = {
  thermometer: LiaTemperatureHighSolid,
  heart: LiaHeartbeatSolid,
  zap: LiaBoltSolid,
  sparkles: LiaShieldAltSolid,
  baby: LiaChildSolid,
  leaf: LiaLeafSolid,
  shamollash: LiaTemperatureHighSolid,
  yurak: LiaHeartbeatSolid,
  ogriq: LiaBoltSolid,
  vitaminlar: LiaShieldAltSolid,
  bolalar: LiaChildSolid,
  allergiya: LiaLeafSolid,
  oshqozon: LiaCapsulesSolid,
  antibiotiklar: LiaPillsSolid,
};

export const CATEGORY_COLOR_MAP = {
  thermometer: "#ef4444",
  shamollash: "#ef4444",
  heart: "#dc2626",
  yurak: "#dc2626",
  zap: "#8b5cf6",
  ogriq: "#8b5cf6",
  sparkles: "#10b981",
  vitaminlar: "#10b981",
  leaf: "#059669",
  allergiya: "#059669",
  oshqozon: "#f59e0b",
  bolalar: "#0d9488",
  antibiotiklar: "#087b51",
};

export function CategoryIcon({ name, className = "h-5 w-5", style }) {
  const Icon = CATEGORY_ICON_MAP[name] || LiaPillsSolid;
  const color = CATEGORY_COLOR_MAP[name] || "#087b51";
  return <Icon className={className} style={{ color, ...style }} aria-hidden />;
}

export function branchShortLabel(branch) {
  if (!branch) return "Manzilni tanlang";
  const place = branch.shortLabel || branch.district || branch.name;
  return `${branch.city || "Toshkent"}, ${place}`;
}
