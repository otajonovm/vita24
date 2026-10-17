import i18n from "../i18n";

export function formatGrouped(value) {
  return Math.round(Number(value) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatSom(value) {
  const amount = Math.round(Number(value) || 0);
  const grouped = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return i18n.t("money.som", { amount: grouped });
}

export function normalizePhoneInput(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("998") && digits.length >= 12) {
    return `+${digits.slice(0, 12)}`;
  }

  if (digits.length >= 9) {
    return `+998${digits.slice(-9)}`;
  }

  if (digits.length > 0) {
    return `+998${digits}`;
  }

  return "";
}

export function isValidUzbekPhone(value) {
  return /^\+998\d{9}$/.test(String(value || "").replace(/\s/g, ""));
}

export function formatPhoneDisplay(phone) {
  const normalized = normalizePhoneInput(phone);
  if (!isValidUzbekPhone(normalized)) return phone;
  const local = normalized.slice(4);
  return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

export function formatReservation(msLeft) {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return i18n.t("money.left", { minutes, seconds: String(seconds).padStart(2, "0") });
}

export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const year = shifted.getUTCFullYear();
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${day}.${month}.${year}, ${hour}:${minute}`;
}

export function formatClock(msLeft) {
  const total = Math.max(0, Math.floor(Number(msLeft) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function orderStatusLabel(order) {
  const rejected =
    order?.status === "CANCELLED" &&
    (order?.prescription?.status === "REJECTED" || Boolean(order?.prescription?.rejectNote));
  if (rejected) return "Rad etilgan";
  return STATUS_LABELS[order?.status] || order?.status || "";
}

export const STATUS_TONES = {
  PENDING_PRESCRIPTION: "border-amber-200 bg-amber-50 text-amber-800",
  PENDING_BRANCH: "border-amber-200 bg-amber-50 text-amber-800",
  WAITING_PAYMENT: "border-amber-200 bg-amber-50 text-amber-800",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PREPARING: "border-sky-200 bg-sky-50 text-sky-800",
  READY: "border-teal-200 bg-teal-50 text-teal-800",
  DELIVERING: "border-sky-200 bg-sky-50 text-sky-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
};

export const STATUS_LABELS = {
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
