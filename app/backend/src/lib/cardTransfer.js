const RECEIPT_REVIEW_MS = 2 * 60 * 60 * 1000;
const RECEIPT_REJECT_EXTEND_MS = 30 * 60 * 1000;

const RECEIPT_REJECT_REASONS = {
  NOT_RECEIVED: "Pul tushmagan",
  WRONG_AMOUNT: "Summa noto'g'ri",
  UNREADABLE: "Chek o'qilmaydi",
  OTHER: "Boshqa",
};

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeCardNumber(value) {
  return digitsOnly(value).slice(0, 16);
}

function isValidCardNumber(value) {
  return /^\d{16}$/.test(normalizeCardNumber(value));
}

function isMaskedCardNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (raw.includes("*")) return true;
  const digits = digitsOnly(raw);
  return digits.length > 0 && digits.length < 16 && /\*/.test(raw);
}

function formatCardGrouped(value) {
  const digits = normalizeCardNumber(value);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function maskCardNumber(value) {
  const digits = normalizeCardNumber(value);
  if (digits.length !== 16) return "****";
  return `${digits.slice(0, 4)} **** **** ${digits.slice(12)}`;
}

function receiptRejectLabel(codeOrText) {
  const raw = String(codeOrText || "").trim();
  if (!raw) return "";
  if (RECEIPT_REJECT_REASONS[raw]) return RECEIPT_REJECT_REASONS[raw];
  return raw;
}

function cardFieldsFrom(source, timeoutMin = 30) {
  return {
    cardTransferEnabled: true,
    cardTransferNumber: normalizeCardNumber(source.cardTransferNumber),
    cardTransferHolder: String(source.cardTransferHolder || "").trim(),
    cardTransferBank: String(source.cardTransferBank || "").trim(),
    cardTransferTimeoutMin: Math.min(180, Math.max(5, Number(timeoutMin || 30))),
  };
}

function hasUsableCard(source) {
  if (!source || !source.cardTransferEnabled) return false;
  const number = normalizeCardNumber(source.cardTransferNumber);
  const holder = String(source.cardTransferHolder || "").trim();
  return isValidCardNumber(number) && Boolean(holder);
}

/**
 * Filial kartasi birinchi; yo'q bo'lsa global ShopSetting zaxira.
 */
function resolveCardTransfer(branch, shop = {}) {
  const timeout = Number(shop.cardTransferTimeoutMin || 30);
  if (hasUsableCard(branch)) {
    return { ...cardFieldsFrom(branch, timeout), source: "branch" };
  }
  if (hasUsableCard(shop)) {
    return { ...cardFieldsFrom(shop, timeout), source: "shop" };
  }
  return {
    cardTransferEnabled: false,
    cardTransferNumber: "",
    cardTransferHolder: "",
    cardTransferBank: "",
    cardTransferTimeoutMin: timeout,
    source: null,
  };
}

function cardTransferPublic(settings) {
  const enabled = Boolean(settings?.cardTransferEnabled);
  if (!enabled) {
    return {
      cardTransferEnabled: false,
      cardTransferTimeoutMin: Number(settings?.cardTransferTimeoutMin || 30),
    };
  }
  return {
    cardTransferEnabled: true,
    cardTransferNumber: normalizeCardNumber(settings.cardTransferNumber),
    cardTransferHolder: String(settings.cardTransferHolder || "").trim(),
    cardTransferBank: String(settings.cardTransferBank || "").trim(),
    cardTransferTimeoutMin: Number(settings.cardTransferTimeoutMin || 30),
  };
}

function cardTransferStaffView(branch) {
  const number = normalizeCardNumber(branch?.cardTransferNumber || "");
  return {
    cardTransferEnabled: Boolean(branch?.cardTransferEnabled),
    cardTransferNumber: number,
    cardTransferNumberMasked: maskCardNumber(number),
    cardTransferHolder: String(branch?.cardTransferHolder || "").trim(),
    cardTransferBank: String(branch?.cardTransferBank || "").trim(),
  };
}

function cardTransferAdminMasked(branch) {
  const number = normalizeCardNumber(branch?.cardTransferNumber || "");
  const enabled = Boolean(branch?.cardTransferEnabled) && isValidCardNumber(number) && Boolean(String(branch?.cardTransferHolder || "").trim());
  return {
    cardTransferEnabled: enabled,
    cardTransferNumberMasked: number ? maskCardNumber(number) : "",
    cardTransferHolder: String(branch?.cardTransferHolder || "").trim(),
    cardTransferBank: String(branch?.cardTransferBank || "").trim(),
  };
}

module.exports = {
  RECEIPT_REVIEW_MS,
  RECEIPT_REJECT_EXTEND_MS,
  RECEIPT_REJECT_REASONS,
  digitsOnly,
  normalizeCardNumber,
  isValidCardNumber,
  isMaskedCardNumber,
  formatCardGrouped,
  maskCardNumber,
  receiptRejectLabel,
  hasUsableCard,
  resolveCardTransfer,
  cardTransferPublic,
  cardTransferStaffView,
  cardTransferAdminMasked,
};
