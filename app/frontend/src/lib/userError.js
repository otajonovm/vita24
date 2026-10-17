import i18n from "../i18n";

const CODES = [
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "PRESCRIPTION_REQUIRED",
  "INSUFFICIENT_STOCK",
  "STOCK_UNAVAILABLE",
  "INVALID_STATUS",
  "PAYMENT_NOT_ALLOWED",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "PROMO_INVALID",
];

export function userError(error, t, fallbackKey = "error.generic") {
  const code = error?.response?.data?.error?.code;
  if (code === "CUSTOMER_BLOCKED") {
    return error?.response?.data?.error?.message || t("cart.blocked");
  }
  if (code === "PROMO_INVALID" || code === "RATE_LIMIT") {
    return error?.response?.data?.error?.message || t("cart.promoInvalid");
  }
  if (code && CODES.includes(code) && i18n.exists(`error.${code}`)) {
    return t(`error.${code}`);
  }
  if (i18n.language === "uz") {
    return error?.response?.data?.error?.message || error?.message || t(fallbackKey);
  }
  return t(fallbackKey);
}
