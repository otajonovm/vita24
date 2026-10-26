const { z } = require("zod");
const { branchIdQuery, dateQuery, pageQuery, limitQuery } = require("./queryFields");
const { isStaffPassword, STAFF_PASSWORD_MESSAGE } = require("../lib/staffPassword");

const staffPassword = z.string().refine(isStaffPassword, STAFF_PASSWORD_MESSAGE);

const optionalText = z.string().trim().optional().nullable();

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Vaqt HH:MM bo'lishi kerak");
const dayHours = z
  .object({
    open: clock,
    close: clock,
    closed: z.boolean(),
  })
  .strict();
const weekHours = z
  .object({
    mon: dayHours,
    tue: dayHours,
    wed: dayHours,
    thu: dayHours,
    fri: dayHours,
    sat: dayHours,
    sun: dayHours,
  })
  .strict();

const medicineWriteSchema = z
  .object({
    name: z.string().trim().min(1, "Nomi majburiy").max(180),
    activeIngredient: optionalText,
    dosage: optionalText,
    dosageForm: z.string().trim().min(1, "Shakli majburiy").max(80),
    quantityInPack: z.coerce.number().int().min(1).max(10000),
    manufacturer: z.string().trim().min(1, "Ishlab chiqaruvchi majburiy").max(180),
    categoryId: z.string().trim().min(1, "Kategoriyani tanlang"),
    isPrescription: z.boolean(),
    barcode: optionalText,
    usage: optionalText,
    contraindications: optionalText,
    storageConditions: optionalText,
    basePrice: z.coerce.number().min(0).max(100000000),
  })
  .strict();

const medicineRxSchema = z
  .object({
    isPrescription: z.boolean(),
  })
  .strict();

const medicineRxBulkSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1).max(200),
    isPrescription: z.boolean(),
  })
  .strict();

const medicineActiveSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

const categoryWriteSchema = z
  .object({
    name: z.string().trim().min(1, "Kategoriya nomi majburiy").max(80),
    icon: z.string().trim().min(1).max(40).optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .strict();

const importConfirmSchema = z
  .object({
    rows: z.array(z.record(z.any())).min(1).max(2000),
  })
  .strict();

const branchWriteSchema = z
  .object({
    name: z.string().trim().min(1, "Filial nomi majburiy"),
    slug: z
      .string()
      .trim()
      .max(56)
      .optional(),
    address: z.string().trim().min(1, "Manzil majburiy"),
    phone: z.string().trim().regex(/^\+998\d{9}$/, "Telefon +998XXXXXXXXX bo'lishi kerak"),
    city: z.string().trim().min(1).optional(),
    district: z.string().trim().min(1).optional(),
    workingHours: z.union([z.object({ allDay: z.literal(true) }).strict(), weekHours]).optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    deliveryRadiusKm: z.number().int().min(1).max(50).optional(),
    lowStockThreshold: z.coerce.number().int().min(1).max(1000).optional(),
    lekkoApiKey: optionalText,
    lekkoDrugStoreId: z.union([z.coerce.number().int().positive(), z.null(), z.literal("")]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const branchPatchSchema = branchWriteSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "Yangilanadigan maydon yuborilmadi",
});

const pharmacistCreateSchema = z
  .object({
    fullName: z.string().trim().min(1, "Ism majburiy"),
    phone: z.string().trim().min(1, "Telefon majburiy"),
    password: staffPassword,
    role: z.enum(["BRANCH_ADMIN", "MANAGER"]).optional(),
    branchId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if ((data.role || "BRANCH_ADMIN") === "BRANCH_ADMIN" && !data.branchId) {
      ctx.addIssue({ code: "custom", path: ["branchId"], message: "Filialni tanlang" });
    }
  });

const pharmacistPatchSchema = z
  .object({
    fullName: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    password: staffPassword.optional(),
    role: z.enum(["BRANCH_ADMIN", "MANAGER"]).optional(),
    branchId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Yangilanadigan maydon yuborilmadi",
  });

const staffStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]),
  })
  .strict();

const customerBlockSchema = z
  .object({
    action: z.enum(["BLOCK", "UNBLOCK"]),
    reason: z.string().trim().min(3, "Sabab kamida 3 ta belgi").max(300, "Sabab 300 belgidan oshmasin"),
  })
  .strict();

const clearLekkoKeySchema = z
  .object({
    confirm: z.literal(true, { errorMap: () => ({ message: "Kalitni o'chirishni tasdiqlang" }) }),
  })
  .strict();

const archiveBranchSchema = z
  .object({
    confirm: z.literal(true, { errorMap: () => ({ message: "Arxivlashni tasdiqlang" }) }),
  })
  .strict();

const dashboardQuerySchema = z
  .object({
    from: dateQuery,
    to: dateQuery,
    branchId: branchIdQuery,
  })
  .strict();

const reportQuerySchema = dashboardQuerySchema.extend({
  format: z.enum(["csv", "xlsx"]).optional(),
});

const reportParamSchema = z
  .object({
    kind: z.enum(["orders", "revenue", "branches", "medicines"], {
      errorMap: () => ({ message: "Hisobot turi noto'g'ri" }),
    }),
  })
  .strict();

const stockNetworkQuerySchema = z
  .object({
    search: z.string().trim().max(80).optional(),
    filter: z.enum(["all", "low", "out"]).optional(),
    page: pageQuery,
    limit: limitQuery,
  })
  .strict();

const stockMovementQuerySchema = z
  .object({
    branchId: branchIdQuery,
    search: z.string().trim().max(80).optional(),
    reason: z.string().trim().max(40).optional(),
    from: dateQuery,
    to: dateQuery,
    page: pageQuery,
    limit: limitQuery,
  })
  .strict();

const showcaseQuerySchema = z
  .object({
    branchId: branchIdQuery,
  })
  .strict();

const showcaseOrderSchema = z
  .object({
    ids: z.array(z.string().trim().min(1).max(80)).max(20),
  })
  .strict();

const nullableLimit = z.union([z.null(), z.coerce.number().int().min(1).max(1000000)]).optional();
const nullableDate = z.union([z.null(), z.string().datetime({ offset: true })]).optional();

const promoWriteSchema = z
  .object({
    code: z.string().trim().min(2, "Kod kamida 2 ta belgi").max(40).transform((value) => value.toUpperCase()),
    type: z.enum(["PERCENT", "AMOUNT"]),
    value: z.coerce.number().positive("Qiymat musbat bo'lishi kerak").max(100000000),
    maxDiscount: z.union([z.null(), z.coerce.number().min(0).max(100000000)]).optional(),
    minSubtotal: z.coerce.number().min(0).max(100000000).optional().default(0),
    usageLimit: nullableLimit,
    perUserLimit: nullableLimit,
    startsAt: nullableDate,
    expiresAt: nullableDate,
    active: z.boolean(),
    allBranches: z.boolean(),
    branchIds: z.array(z.string().trim().min(1).max(80)).max(50).optional().default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === "PERCENT" && data.value > 100) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Foiz 100 dan oshmasin" });
    }
    if (!data.allBranches && data.branchIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Kamida bitta filial tanlang" });
    }
    if (data.startsAt && data.expiresAt && new Date(data.startsAt).getTime() >= new Date(data.expiresAt).getTime()) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Tugash vaqti boshlanishidan keyin bo'lishi kerak" });
    }
  });

const promoActiveSchema = z
  .object({
    active: z.boolean(),
  })
  .strict();

const lekkoSettingsSchema = z
  .object({
    intervalMinutes: z.coerce.number().int().min(1).max(1440),
  })
  .strict();

const shopSettingsSchema = z
  .object({
    deliveryFee: z.coerce.number().min(0).max(100000000),
    freeDeliveryFrom: z.coerce.number().min(0).max(100000000),
    reviewWindowMinutes: z.coerce.number().int().min(15).max(1440),
    paymentWindowMinutes: z.coerce.number().int().min(5).max(180),
    paymeEnabled: z.boolean(),
    clickEnabled: z.boolean(),
    cashEnabled: z.boolean(),
    pickupEnabled: z.boolean(),
    telegramBotToken: z.string().trim().max(200).optional().or(z.literal("")),
    messageTemplates: z.record(z.string().trim().min(1).max(500)).optional(),
    contactPhone: z.string().trim().min(3).max(40),
    contactPhoneAlt: z.string().trim().max(40).optional().or(z.literal("")),
    footerAbout: z.string().trim().min(2).max(500),
    footerLicensed: z.string().trim().min(2).max(300),
    footerShort: z.string().trim().min(2).max(500),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.paymeEnabled && !data.clickEnabled && !data.cashEnabled) {
      ctx.addIssue({ code: "custom", path: ["cashEnabled"], message: "Kamida bitta to'lov turi yoqilishi kerak" });
    }
  });

const lekkoLogQuerySchema = z
  .object({
    branchId: branchIdQuery,
    page: pageQuery,
    limit: limitQuery,
  })
  .strict();

function optionalQueryText(max) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    const text = String(value).trim();
    return text || undefined;
  }, z.string().max(max).optional());
}

const auditQuerySchema = z
  .object({
    page: pageQuery,
    limit: limitQuery,
    userId: optionalQueryText(80),
    action: optionalQueryText(80),
    entityType: optionalQueryText(40),
    from: dateQuery,
    to: dateQuery,
  })
  .strict();

module.exports = {
  branchWriteSchema,
  branchPatchSchema,
  pharmacistCreateSchema,
  pharmacistPatchSchema,
  staffStatusSchema,
  customerBlockSchema,
  clearLekkoKeySchema,
  archiveBranchSchema,
  dashboardQuerySchema,
  reportQuerySchema,
  reportParamSchema,
  auditQuerySchema,
  medicineWriteSchema,
  medicineActiveSchema,
  medicineRxSchema,
  medicineRxBulkSchema,
  categoryWriteSchema,
  importConfirmSchema,
  stockNetworkQuerySchema,
  stockMovementQuerySchema,
  showcaseQuerySchema,
  showcaseOrderSchema,
  promoWriteSchema,
  promoActiveSchema,
  lekkoSettingsSchema,
  lekkoLogQuerySchema,
  shopSettingsSchema,
};
