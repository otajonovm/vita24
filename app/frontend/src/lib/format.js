import i18n from "../i18n";

export function formatGrouped(value) {
  return Math.round(Number(value) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatSom(value) {
  if (value == null || value === "") return "";
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount)) return "";
  const grouped = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return i18n.t("money.som", { amount: grouped });
}

/** Filial narxi, yo'q bo'lsa minPrice "… dan", aks holda "Filial tanlang". */
export function formatPriceLabel(medicine, t) {
  if (medicine?.price != null && medicine.price !== "" && Number.isFinite(Number(medicine.price))) {
    return formatSom(medicine.price);
  }
  const min = medicine?.minPrice ?? medicine?.priceFrom;
  if (min != null && min !== "" && Number(min) > 0) {
    return i18n.t("money.from", { amount: formatGrouped(min) });
  }
  return t ? t("medicine.pickBranch") : i18n.t("medicine.pickBranch");
}

export function normalizePhoneInput(value) {
  let digits = String(value || "").replace(/\D/g, "");
  // Pasted/typed "+998..." must not get a second country code.
  while (digits.startsWith("998998")) digits = digits.slice(3);
  if (digits.startsWith("998")) {
    return `+${digits.slice(0, 12)}`;
  }
  if (!digits) return "";
  return `+998${digits.slice(0, 9)}`;
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

const STATUS_I18N = {
  PENDING_PRESCRIPTION: "order.status.review",
  PENDING_BRANCH: "order.status.pendingBranch",
  WAITING_PAYMENT: "order.status.waitingPayment",
  PAID: "order.status.paid",
  PREPARING: "order.status.preparing",
  READY: "order.status.ready",
  DELIVERING: "order.status.delivering",
  COMPLETED: "order.status.completed",
  CANCELLED: "order.status.cancelled",
};

export function orderStatusLabel(order) {
  if (order?.courierStage === "FAILED") return i18n.t("courier.stage.failed");
  if (order?.courierStage === "ASSIGNED" && order?.status === "READY") return i18n.t("courier.stage.assigned");
  if (order?.courierStage === "PICKED_UP") return i18n.t("courier.stage.enRoute");
  if (order?.courierStage === "DELIVERED") return i18n.t("courier.stage.delivered");
  const rejected =
    order?.status === "CANCELLED" &&
    (order?.prescription?.status === "REJECTED" || Boolean(order?.prescription?.rejectNote));
  if (rejected) return i18n.t("order.status.rxRejected");
  const key = STATUS_I18N[order?.status];
  return key ? i18n.t(key) : order?.status || "";
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

