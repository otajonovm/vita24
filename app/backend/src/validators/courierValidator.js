const { z } = require("zod");

const createCourierSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9).max(20),
  password: z.string().min(8).max(80),
});

const updateCourierSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((data) => data.name != null || data.status != null, { message: "O'zgarish yo'q" });

const assignCourierSchema = z.object({
  courierId: z.string().trim().min(1),
});

const handoverNoteSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

const disputeSchema = z.object({
  note: z.string().trim().min(3).max(300),
});

module.exports = {
  createCourierSchema,
  updateCourierSchema,
  assignCourierSchema,
  handoverNoteSchema,
  disputeSchema,
};
