const { z } = require("zod");
const { ORDER_STATUSES, branchIdQuery, statusQuery, pageQuery, limitQuery, dateQuery } = require("./queryFields");

const orderItemSchema = z
  .object({
    medicineId: z.string({ required_error: "medicineId majburiy" }).trim().min(1),
    quantity: z.coerce
      .number({ invalid_type_error: "quantity son bo'lishi kerak" })
      .int("quantity butun son bo'lishi kerak")
      .positive("quantity musbat butun son bo'lishi kerak"),
  })
  .passthrough();

const createOrderSchema = z
  .object({
    branchId: z.string({ required_error: "branchId majburiy" }).trim().min(1, "branchId majburiy"),
    items: z
      .array(orderItemSchema, { required_error: "items majburiy" })
      .min(1, "Savatcha bo'sh bo'lishi mumkin emas"),
    phone: z.string().trim().min(1).optional(),
    customerPhone: z.string().trim().min(1).optional(),
    fullName: z.string().trim().min(1).optional(),
    customerName: z.string().trim().min(1).optional(),
    deliveryType: z.enum(["DELIVERY", "PICKUP"]).optional(),
    promoCode: z.string().trim().max(40).optional().nullable(),
    deliveryAddress: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    prescriptionUrl: z.string().trim().optional().nullable(),
    prescription: z
      .object({
        fileUrl: z.string().trim().optional(),
        fileName: z.string().trim().optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
    street: z.string().trim().optional().nullable(),
    apartment: z.string().trim().optional().nullable(),
    floor: z.string().trim().optional().nullable(),
    intercom: z.string().trim().optional().nullable(),
    lat: z.coerce.number().optional().nullable(),
    lng: z.coerce.number().optional().nullable(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (!data.phone && !data.customerPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "phone yoki customerPhone majburiy",
        path: ["phone"],
      });
    }
    if (!data.fullName && !data.customerName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fullName yoki customerName majburiy",
        path: ["fullName"],
      });
    }
    if (data.deliveryType !== "PICKUP" && String(data.deliveryAddress || "").trim().length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Yetkazib berish manzili majburiy",
        path: ["deliveryAddress"],
      });
    }
  });

const updateOrderStatusSchema = z
  .object({
    status: z.string({ required_error: "status majburiy" }).trim().min(1),
    rejectNote: z.string().trim().optional().nullable(),
    cancelReason: z.string().trim().optional().nullable(),
  })
  .passthrough();

const searchQuery = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    const text = String(value).trim();
    return text ? text : undefined;
  },
  z.string().max(80, "Qidiruv juda uzun").optional()
);

const listOrdersQuerySchema = z
  .object({
    status: statusQuery([...ORDER_STATUSES, "REJECTED"]),
    branchId: branchIdQuery,
    page: pageQuery,
    limit: limitQuery,
    from: dateQuery,
    to: dateQuery,
    q: searchQuery,
    paymentProvider: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["CASH", "CLICK", "PAYME", "MOCK", "CARD_TERMINAL"]).optional()
    ),
    paymentStatus: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["PENDING", "COMPLETED", "FAILED"]).optional()
    ),
    deliveryType: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["DELIVERY", "PICKUP"]).optional()
    ),
    refundStatus: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["NONE", "PENDING", "DONE", "NOT_REQUIRED"]).optional()
    ),
    sort: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["newest", "wait"]).optional()
    ),
    queue: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["review"]).optional()
    ),
    wait: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["long"]).optional()
    ),
  })
  .strict();

const promoCheckSchema = z
  .object({
    code: z.string().trim().min(1, "Promokod kiriting").max(40),
    subtotal: z.coerce.number().min(0).max(100000000),
    branchId: z.string().trim().max(80).optional().nullable(),
  })
  .strict();

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema,
  orderItemSchema,
  listOrdersQuerySchema,
  promoCheckSchema,
};
