const { z } = require("zod");

const ORDER_STATUSES = [
  "PENDING_PRESCRIPTION",
  "PENDING_BRANCH",
  "WAITING_PAYMENT",
  "PAID",
  "PREPARING",
  "READY",
  "DELIVERING",
  "COMPLETED",
  "CANCELLED",
];

const PANEL_ORDER_STATUSES = [...ORDER_STATUSES, "review", "rejected", "cancelled", "failed_delivery"];

function blankToUndefined(value) {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value;
  const text = String(value).trim();
  return text ? text : undefined;
}

function isRealDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const branchIdQuery = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "branchId noto'g'ri")
    .optional()
);

function statusQuery(values) {
  return z.preprocess(
    blankToUndefined,
    z.enum(values, { errorMap: () => ({ message: "status noto'g'ri" }) }).optional()
  );
}

const pageQuery = z.preprocess(
  (value) => (value == null || value === "" ? undefined : value),
  z.coerce
    .number({ invalid_type_error: "sahifa noto'g'ri" })
    .int("sahifa butun son bo'lishi kerak")
    .min(1, "sahifa noto'g'ri")
    .optional()
);

const limitQuery = z.preprocess(
  (value) => (value == null || value === "" ? undefined : value),
  z.coerce.number({ invalid_type_error: "limit noto'g'ri" }).int().min(1).max(50).optional()
);

const dateQuery = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD bo'lishi kerak")
    .refine(isRealDate, "Sana noto'g'ri")
    .optional()
);

const instantQuery = z.preprocess(
  blankToUndefined,
  z.string().refine((value) => Number.isFinite(Date.parse(value)), "Sana noto'g'ri").optional()
);

module.exports = {
  ORDER_STATUSES,
  PANEL_ORDER_STATUSES,
  branchIdQuery,
  statusQuery,
  pageQuery,
  limitQuery,
  dateQuery,
  instantQuery,
};
