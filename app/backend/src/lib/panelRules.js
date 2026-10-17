const { openingTime } = require("./branchProfile");
const MAX_STOCK = 100000;
const UNDO_WINDOW_MS = 30 * 1000;
const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;

const CAPTURED_STATUSES = ["PAID", "PREPARING", "READY", "DELIVERING"];
const REVIEW_STATUSES = ["PENDING_PRESCRIPTION", "PENDING_BRANCH"];
const RESERVED_STATUSES = ["PENDING_PRESCRIPTION", "PENDING_BRANCH", "WAITING_PAYMENT"];

const CANCEL_REASONS = ["OUT_OF_STOCK", "CUSTOMER_DECLINED", "UNDELIVERABLE", "OTHER"];
const CANCEL_LABELS = {
  OUT_OF_STOCK: "Dori tugadi",
  CUSTOMER_DECLINED: "Mijoz voz kechdi",
  UNDELIVERABLE: "Manzilga yetkazib bo'lmadi",
  OTHER: "Boshqa",
};

const STOCK_REASONS = ["kirim", "sotildi", "buzildi", "inventarizatsiya", "boshqa"];
const STOCK_LABELS = {
  kirim: "Kirim",
  sotildi: "Oflayn sotildi",
  buzildi: "Buzildi / muddati o'tdi",
  inventarizatsiya: "Inventarizatsiya",
  boshqa: "Boshqa",
};

const REJECT_REASONS = ["NO_STAMP", "NO_SIGNATURE", "EXPIRED", "UNREADABLE", "WRONG_DRUG", "WRONG_DOSE", "OTHER"];
const REJECT_LABELS = {
  NO_STAMP: "Muhr yo'q",
  NO_SIGNATURE: "Shifokor imzosi yo'q",
  EXPIRED: "Retsept muddati o'tgan",
  UNREADABLE: "O'qib bo'lmaydi",
  WRONG_DRUG: "Boshqa dori yozilgan",
  WRONG_DOSE: "Dozasi mos emas",
  OTHER: "Boshqa",
};

function stockCountError(value) {
  if (value === "" || value === null || value === undefined) return "Qoldiqni kiriting";
  if (typeof value !== "number" || !Number.isFinite(value)) return "Qoldiq butun son bo'lishi kerak";
  if (!Number.isInteger(value)) return "Qoldiq butun son bo'lishi kerak";
  if (value < 0) return "Qoldiq manfiy bo'lishi mumkin emas";
  if (value > MAX_STOCK) return "Qoldiq 100000 dan oshmasligi kerak";
  return null;
}

function restoresStockOnCancel(fromStatus) {
  return CAPTURED_STATUSES.includes(fromStatus);
}

function releasesReservationOnCancel(fromStatus) {
  return RESERVED_STATUSES.includes(fromStatus);
}

function refundStatusForCancel(order) {
  if (!restoresStockOnCancel(order?.status)) return null;
  if (order?.payment?.status !== "COMPLETED") return "NOT_REQUIRED";
  return "PENDING";
}

function closedBranchMessage(branch, now = new Date()) {
  if (!branch || branch.isOpen !== false) return null;
  const opens = openingTime(branch.workingHours, now);
  return opens ? `Filial hozir yopiq, ochilish vaqti ${opens}` : "Filial hozir yopiq";
}

function pageWindow(query = {}) {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(query.limit) || PAGE_SIZE)));
  return { page, limit, skip: (page - 1) * limit };
}

function canUndo(history, userId, now = Date.now()) {
  if (!history || !userId || history.userId !== userId) return false;
  if (history.kind === "undo" || history.kind === "system") return false;
  const at = new Date(history.createdAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at <= UNDO_WINDOW_MS;
}

function freeForLine(stock, heldByOrder = 0) {
  const count = Number(stock?.stockCount || 0);
  const reserved = Number(stock?.reservedCount || 0);
  return count - reserved + Number(heldByOrder || 0);
}

function resubmitExpired(order, now = Date.now()) {
  const start = new Date(order?.statusChangedAt || order?.updatedAt || order?.createdAt || 0).getTime();
  if (!Number.isFinite(start)) return true;
  return now - start > REOPEN_WINDOW_MS;
}

function reviewBlockReason(order, now = Date.now()) {
  if (!order) return "Buyurtma topilmadi";
  if (order.status === "COMPLETED") return "Yakunlangan buyurtmani tasdiqlab bo'lmaydi";
  if (order.prescription?.status === "REJECTED") return "Rad etilgan buyurtmani qayta tekshirib bo'lmaydi";
  if (order.prescription?.status === "APPROVED") return "Retsept allaqachon tasdiqlangan";
  if (order.status === "PENDING_PRESCRIPTION" || order.status === "PENDING_BRANCH") return null;
  if (order.status === "CANCELLED" && order.prescription?.status === "PENDING") {
    const age = now - new Date(order.createdAt).getTime();
    if (age > REOPEN_WINDOW_MS) return "Qayta ochish muddati o'tgan";
    return null;
  }
  if (order.status === "CANCELLED") return "Bekor qilingan buyurtmani tasdiqlab bo'lmaydi";
  return "Bu buyurtma farmatsevt tasdig'ini kutmayapti";
}

function rejectText(codes, note) {
  const parts = (codes || []).map((code) => REJECT_LABELS[code]).filter(Boolean);
  const extra = String(note || "").trim();
  if ((codes || []).includes("OTHER") && extra) parts.push(extra);
  return parts.filter((part, index) => parts.indexOf(part) === index).join(", ");
}

function cancelText(reason, note) {
  const label = CANCEL_LABELS[reason] || reason || "";
  const extra = String(note || "").trim();
  if (reason === "OTHER") return extra;
  return [label, extra].filter(Boolean).join(". ");
}

module.exports = {
  MAX_STOCK,
  UNDO_WINDOW_MS,
  REOPEN_WINDOW_MS,
  PAGE_SIZE,
  CAPTURED_STATUSES,
  REVIEW_STATUSES,
  RESERVED_STATUSES,
  CANCEL_REASONS,
  CANCEL_LABELS,
  STOCK_REASONS,
  STOCK_LABELS,
  REJECT_REASONS,
  REJECT_LABELS,
  stockCountError,
  restoresStockOnCancel,
  releasesReservationOnCancel,
  refundStatusForCancel,
  closedBranchMessage,
  pageWindow,
  canUndo,
  freeForLine,
  resubmitExpired,
  reviewBlockReason,
  rejectText,
  cancelText,
};
