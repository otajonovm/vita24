const { z } = require("zod");

const optionalId = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const suggestQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional().default(""),
    branchId: optionalId,
  })
  .passthrough();

const searchClickSchema = z
  .object({
    query: z.string().trim().min(2).max(100),
    medicineId: z.string().trim().min(1).max(80),
    branchId: z.string().trim().max(80).optional(),
  })
  .strict();

const synonymSchema = z
  .object({
    term: z.string().trim().min(2).max(80),
    canonical: z.string().trim().min(2).max(80),
    type: z.enum(["BRAND", "INGREDIENT", "SYMPTOM", "SPELLING"]),
  })
  .strict();

module.exports = {
  suggestQuerySchema,
  searchClickSchema,
  synonymSchema,
};
