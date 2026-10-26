const STAFF_ROLES = new Set(["BRANCH_ADMIN", "SUPER_ADMIN", "MANAGER"]);

const ORDER_STATUS_LABELS = {
  PENDING_PRESCRIPTION: "Retsept kutilmoqda",
  PENDING_BRANCH: "Filial ko'rigida",
  WAITING_PAYMENT: "To'lov kutilmoqda",
  PAID: "To'langan",
  PREPARING: "Yig'ilmoqda",
  READY: "Tayyor",
  DELIVERING: "Yetkazilmoqda",
  COMPLETED: "Yakunlangan",
  CANCELLED: "Bekor qilingan",
};

function normalizeTelegramPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length >= 12) return `+${digits.slice(0, 12)}`;
  if (digits.length === 9) return `+998${digits}`;
  return "";
}

function isOwnContact(fromId, contact) {
  return Number(contact?.user_id) === Number(fromId);
}

function isStaffRole(role) {
  return STAFF_ROLES.has(String(role || ""));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSom(value) {
  const amount = Math.round(Number(value) || 0);
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped} so'm`;
}

function formatTashkent(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("day")}.${pick("month")}.${pick("year")} ${pick("hour")}:${pick("minute")}`;
}

function orderStatusLabel(order) {
  const rejected =
    order?.status === "CANCELLED" &&
    (order?.prescription?.status === "REJECTED" || Boolean(order?.prescription?.rejectNote));
  if (rejected) return "Rad etilgan";
  return ORDER_STATUS_LABELS[order?.status] || order?.status || "Buyurtma";
}

function toRad(value) {
  return (Number(value) * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const aLat = Number(lat1);
  const aLng = Number(lng1);
  const bLat = Number(lat2);
  const bLng = Number(lng2);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestBranches(origin, branches, limit = 3) {
  const lat = Number(origin?.lat);
  const lng = Number(origin?.lng);
  return (branches || [])
    .filter(
      (branch) =>
        branch &&
        branch.isActive !== false &&
        Number.isFinite(Number(branch.lat)) &&
        Number.isFinite(Number(branch.lng))
    )
    .map((branch) => ({
      ...branch,
      distanceKm: haversineKm(lat, lng, branch.lat, branch.lng),
    }))
    .filter((branch) => Number.isFinite(branch.distanceKm))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, limit);
}

function stockAvailabilityLabel(stockCount, threshold = 5) {
  const count = Math.max(0, Math.floor(Number(stockCount) || 0));
  if (count <= 0) return "Yo'q";
  if (count <= Math.max(1, Number(threshold) || 5)) return "Kam qoldi";
  return "Bor";
}

module.exports = {
  STAFF_ROLES,
  ORDER_STATUS_LABELS,
  normalizeTelegramPhone,
  isOwnContact,
  isStaffRole,
  escapeHtml,
  formatSom,
  formatTashkent,
  orderStatusLabel,
  haversineKm,
  nearestBranches,
  stockAvailabilityLabel,
};
