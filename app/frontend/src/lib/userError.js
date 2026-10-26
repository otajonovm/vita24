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

function isTransportError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "ERR_NETWORK" ||
    error?.code === "ECONNABORTED" ||
    error?.code === "ERR_CANCELED" ||
    /network error/i.test(message) ||
    /timeout/i.test(message) ||
    /failed to fetch/i.test(message)
  );
}

export function userError(error, t, fallbackKey = "error.generic") {
  if (error?.code === "INVALID_RESPONSE") {
    return error.message || t("error.invalidResponse");
  }
  if (isTransportError(error)) {
    return t(fallbackKey);
  }
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
  const serverMessage = error?.response?.data?.error?.message;
  if (i18n.language === "uz" && serverMessage) {
    return serverMessage;
  }
  return t(fallbackKey);
}
