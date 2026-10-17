const { z } = require("zod");
const { CANCEL_REASONS, REJECT_REASONS, STOCK_REASONS, stockCountError } = require("../lib/panelRules");
const {
  PANEL_ORDER_STATUSES,
  branchIdQuery,
  statusQuery,
  pageQuery,
  limitQuery,
  dateQuery,
} = require("./queryFields");

const optionalText = z.string().trim().max(500).optional();

const stockCountField = z
  .any()
  .superRefine((value, ctx) => {
    const message = stockCountError(value);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });

const branchIdQuerySchema = z
  .object({
    branchId: branchIdQuery,
    status: statusQuery(PANEL_ORDER_STATUSES),
    search: z.string().trim().max(120).optional(),
    from: dateQuery,
    to: dateQuery,
    sort: z.enum(["urgent", "newest", "oldest"]).optional(),
    page: pageQuery,
    limit: limitQuery,
    filter: z.enum(["low", "out", "rx"]).optional(),
    barcode: z.string().trim().max(64).optional(),
  })
  .strict();

const updateStockSchema = z
  .object({
    stockCount: stockCountField,
    reason: z.enum(STOCK_REASONS, {
      errorMap: () => ({ message: "Qoldiq sababini tanlang" }),
    }),
    note: optionalText,
  })
  .strict();

const bulkStockSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().trim().min(1, "Ombor yozuvi tanlanmagan"),
            stockCount: stockCountField,
            reason: z.enum(STOCK_REASONS, {
              errorMap: () => ({ message: "Qoldiq sababini tanlang" }),
            }),
            note: optionalText,
          })
          .strict()
      )
      .min(1, "Saqlash uchun qator yo'q")
      .max(50, "Bir martada 50 tadan ko'p qator saqlanmaydi"),
  })
  .strict();

const verifyPrescriptionSchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT"], {
      errorMap: () => ({ message: "Tasdiqlash yoki rad etishni tanlang" }),
    }),
    rejectReasons: z.array(z.enum(REJECT_REASONS)).max(7).optional(),
    rejectNote: z.string().trim().max(500).optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.action !== "REJECT") return;
    const codes = data.rejectReasons || [];
    if (!codes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Rad etish sababini tanlang", path: ["rejectReasons"] });
    }
    if (codes.includes("OTHER") && !String(data.rejectNote || "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Boshqa sabab uchun izoh yozing", path: ["rejectNote"] });
    }
  });

const syncLekkoSchema = z
  .object({
    branchId: z.string().trim().min(1).optional(),
    fullSync: z.boolean().optional(),
  })
  .strict();

const orderStatusSchema = z
  .object({
    status: z.enum(["PREPARING", "READY", "DELIVERING", "COMPLETED", "CANCELLED"], {
      errorMap: () => ({ message: "Keyingi holat noto'g'ri" }),
    }),
    reason: z.enum(CANCEL_REASONS).optional(),
    note: optionalText,
    confirm: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === "COMPLETED" && data.confirm !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Yakunlashni tasdiqlang",
        path: ["confirm"],
      });
    }
    if (data.status === "CANCELLED" && !data.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bekor qilish sababini tanlang",
        path: ["reason"],
      });
    }
    if (data.status === "CANCELLED" && data.reason === "OTHER" && !String(data.note || "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Boshqa sabab uchun izoh yozing",
        path: ["note"],
      });
    }
  });

const refundSchema = z
  .object({
    status: z.enum(["DONE"], { errorMap: () => ({ message: "Pul qaytarish holati DONE bo'lishi kerak" }) }),
    note: optionalText,
    transactionId: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

const pharmacistNoteSchema = z
  .object({
    pharmacistNote: z.string().trim().max(1000),
  })
  .strict();

const branchOpenSchema = z
  .object({
    branchId: z.string().trim().min(1).optional(),
    isOpen: z.boolean({ required_error: "Ochiq yoki yopiq holatini tanlang" }),
  })
  .strict();

const shiftQuerySchema = z
  .object({
    branchId: branchIdQuery,
    since: z
      .string({ required_error: "Smena boshlanish vaqti kerak" })
      .trim()
      .min(1, "Smena boshlanish vaqti kerak")
      .refine((value) => Number.isFinite(Date.parse(value)), "Sana noto'g'ri"),
  })
  .strict();

const statsQuerySchema = z
  .object({
    branchId: branchIdQuery,
    range: z.enum(["today", "7", "30"]).optional(),
  })
  .strict();

const idParamSchema = z
  .object({
    id: z.string().trim().min(1, "id majburiy"),
  })
  .strict();

module.exports = {
  branchIdQuerySchema,
  updateStockSchema,
  bulkStockSchema,
  verifyPrescriptionSchema,
  syncLekkoSchema,
  orderStatusSchema,
  refundSchema,
  pharmacistNoteSchema,
  branchOpenSchema,
  shiftQuerySchema,
  statsQuerySchema,
  idParamSchema,
};
