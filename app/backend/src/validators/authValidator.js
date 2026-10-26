const { z } = require("zod");

const uzPhoneRegex = /^\+998\d{9}$/;

const loginSchema = z
  .object({
    phone: z
      .string({ required_error: "Telefon raqami majburiy" })
      .trim()
      .min(1, "Telefon raqami majburiy"),
    password: z
      .string({ required_error: "Parol majburiy" })
      .min(6, "Parol kamida 6 ta belgidan iborat bo'lishi kerak")
      .max(128, "Parol juda uzun"),
    totp: z.preprocess(
      (value) => (value == null || String(value).trim() === "" ? undefined : String(value).trim()),
      z.string().regex(/^\d{6}$/, "Kod 6 ta raqam bo'lishi kerak").optional()
    ),
  })
  .strict();

const refreshSchema = z
  .object({
    refreshToken: z
      .string({ required_error: "Refresh token yaroqsiz" })
      .trim()
      .min(20, "Refresh token yaroqsiz"),
  })
  .strict();

const totpCodeSchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, "Kod 6 ta raqam bo'lishi kerak"),
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Joriy parol majburiy"),
    newPassword: z.string().min(8, "Parol kamida 8 belgi, harf va raqam bilan bo'lishi kerak").max(128),
  })
  .strict();

const disable2faSchema = z
  .object({
    password: z.string().min(6, "Parol kamida 6 ta belgidan iborat bo'lishi kerak"),
    code: z.string().trim().regex(/^\d{6}$/, "Kod 6 ta raqam bo'lishi kerak"),
  })
  .strict();

const otpRequestSchema = z
  .object({
    phone: z.string({ required_error: "Telefon raqami majburiy" }).trim().min(1),
  })
  .strict();

const otpVerifySchema = z
  .object({
    phone: z.string({ required_error: "Telefon raqami majburiy" }).trim().min(1),
    code: z
      .string({ required_error: "Kod majburiy" })
      .trim()
      .regex(/^\d{6}$/, "Kod 6 ta raqam bo'lishi kerak"),
    fullName: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const telegramWebAppSchema = z
  .object({
    initData: z
      .string({ required_error: "initData majburiy" })
      .trim()
      .min(10, "initData majburiy")
      .max(8192, "initData juda uzun"),
  })
  .strict();

module.exports = {
  loginSchema,
  refreshSchema,
  totpCodeSchema,
  disable2faSchema,
  changePasswordSchema,
  otpRequestSchema,
  otpVerifySchema,
  telegramWebAppSchema,
  uzPhoneRegex,
};
