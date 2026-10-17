const { z } = require("zod");

const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const listMedicinesQuerySchema = z
  .object({
    branchId: optionalId,
    categoryId: optionalId,
    search: z.string().trim().max(100, "Qidiruv matni juda uzun").optional().default(""),
    inStockOnly: z
      .enum(["true", "false", "1", "0"], {
        errorMap: () => ({ message: "inStockOnly true yoki false bo'lishi kerak" }),
      })
      .optional()
      .transform((value) => value === "true" || value === "1"),
    featured: z
      .enum(["true", "false", "1", "0"], {
        errorMap: () => ({ message: "featured true yoki false bo'lishi kerak" }),
      })
      .optional()
      .transform((value) => value === "true" || value === "1"),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(5000).optional().default(5000),
    sort: z.enum(["default", "popular", "price_asc", "price_desc", "name"]).optional().default("default"),
  })
  .passthrough();

module.exports = {
  listMedicinesQuerySchema,
};
