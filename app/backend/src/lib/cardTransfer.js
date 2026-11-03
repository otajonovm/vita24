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

module.exports = {
  RECEIPT_REVIEW_MS,
  RECEIPT_REJECT_EXTEND_MS,
  RECEIPT_REJECT_REASONS,
  digitsOnly,
  normalizeCardNumber,
  isValidCardNumber,
  formatCardGrouped,
  maskCardNumber,
  receiptRejectLabel,
  cardTransferPublic,
};
