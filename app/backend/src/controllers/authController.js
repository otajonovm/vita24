const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { normalizePhone, serializeUser, provisionCustomer } = require("../lib/userProvisioning");
const { issueOtp, verifyOtp, dropOtp } = require("../lib/otpStore");
const { resetOtpVerify, clearStaffLoginLimits } = require("../lib/rateLimit");
const { deliverOtp, botUrl } = require("../lib/telegramBot");
const { runDbTransaction } = require("../lib/transaction");
const { getJwtSecret } = require("../middlewares/authMiddleware");
const { decryptSecret, encryptSecret } = require("../lib/secrets");
const { generateTotpSecret, otpauthUrl, verifyTotp } = require("../lib/totp");
const {
  createAdminSession,
  rotateAdminSession,
  listAdminSessions,
  revokeAdminSession,
  revokeAllAdminSessions,
} = require("../lib/adminSession");
const { usesAdminSession } = require("../lib/permissions");
const { isStaffPassword, STAFF_PASSWORD_MESSAGE } = require("../lib/staffPassword");
const { writeAudit } = require("../lib/audit");

const BCRYPT_ROUNDS = 10;

function accessExpiresIn(role, override) {
  if (override) return override;
  if (usesAdminSession(role)) return process.env.ADMIN_JWT_EXPIRES_IN || "12h";
  return process.env.JWT_EXPIRES_IN || "7d";
}

function signAccessToken(user, options = {}) {
  const expiresIn = accessExpiresIn(user.role, options.expiresIn);
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      branchId: user.branchId || null,
      typ: "access",
      tv: Number(user.tokenVersion || 0),
      ...(options.sid ? { sid: options.sid } : {}),
    },
    getJwtSecret(),
    { expiresIn }
  );
}

function serializeAuthUser(user) {
  return {
    ...serializeUser(user),
    branchId: user.branchId || null,
    ...(user.role === "SUPER_ADMIN" ? { totpEnabled: Boolean(user.totpEnabled) } : {}),
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

const login = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || "");

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      branchId: true,
      passwordHash: true,
      createdAt: true,
      totpEnabled: true,
      totpSecretEnc: true,
      status: true,
      deletedAt: true,
      mustChangePassword: true,
      tokenVersion: true,
    },
  });

  if (!user || !user.passwordHash) {
    throw new AppError("Telefon yoki parol noto'g'ri", 401, "UNAUTHORIZED");
  }

  // Mehmon (guest:) xeshlar bilan login qilish mumkin emas
  if (user.passwordHash.startsWith("guest:")) {
    throw new AppError("Telefon yoki parol noto'g'ri", 401, "UNAUTHORIZED");
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new AppError("Telefon yoki parol noto'g'ri", 401, "UNAUTHORIZED");
  }

  if (user.deletedAt || user.status === "SUSPENDED") {
    throw new AppError("Hisob to'xtatilgan", 401, "UNAUTHORIZED");
  }

  if (user.role === "SUPER_ADMIN" && user.totpEnabled) {
    const code = String(req.body.totp || "").trim();
    if (!code) {
      return sendSuccess(res, { requires2fa: true }, "Tasdiqlash kodi kerak");
    }
    let secret = "";
    try {
      secret = decryptSecret(user.totpSecretEnc);
    } catch {
      secret = "";
    }
    if (!verifyTotp(secret, code)) {
      throw new AppError("Tasdiqlash kodi noto'g'ri", 401, "UNAUTHORIZED");
    }
  }

  const issued = usesAdminSession(user.role)
    ? await createAdminSession(user, req)
    : {
        token: signAccessToken(user),
        expiresIn: accessExpiresIn(user.role),
      };

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  clearStaffLoginLimits(req);
  await writeAudit(prisma, {
    req,
    user,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    branchId: user.branchId,
    summary: user.phone,
    after: { role: user.role, phone: user.phone },
  });

  return sendSuccess(
    res,
    {
      token: issued.token,
      ...(issued.refreshToken ? { refreshToken: issued.refreshToken } : {}),
      tokenType: "Bearer",
      expiresIn: issued.expiresIn,
      user: serializeAuthUser(user),
    },
    "Muvaffaqiyatli kirildi"
  );
});

const requestOtp = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const issued = issueOtp(phone);

  let sent;
  try {
    sent = await deliverOtp(phone, issued.code);
  } catch (error) {
    dropOtp(phone);
    throw new AppError("Kod Telegramga yuborilmadi. Qayta urinib ko'ring", 502, "OTP_DELIVERY");
  }

  if (sent.ok) {
    resetOtpVerify(phone);
    return sendSuccess(
      res,
      { expiresInSec: issued.expiresInSec, delivery: "telegram", botUrl: botUrl() },
      "Tasdiqlash kodi Telegramga yuborildi"
    );
  }

  if (sent.code === "AWAITING_CONTACT") {
    resetOtpVerify(phone);
    return sendSuccess(
      res,
      {
        expiresInSec: issued.expiresInSec,
        delivery: "telegram",
        awaitingContact: true,
        botUrl: sent.botUrl || botUrl(),
      },
      "Telegram botda telefon raqamingizni yuboring"
    );
  }

  if (sent.code === "NOT_CONFIGURED" && String(process.env.ENABLE_DEV_OTP || "").toLowerCase() === "true") {
    resetOtpVerify(phone);
    return sendSuccess(res, { expiresInSec: issued.expiresInSec, devCode: issued.code }, "Tasdiqlash kodi (dev) tayyor");
  }

  dropOtp(phone);
  const link = sent.botUrl || botUrl();
  throw new AppError(
    link
      ? `Avval Telegram botni oching va /start bosing: ${link}`
      : "Telegram bot sozlanmagan",
    400,
    "TELEGRAM_REQUIRED"
  );
});

const verifyOtpLogin = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || "").trim();
  const result = verifyOtp(phone, code);
  if (!result.ok) {
    throw new AppError(result.reason, 401, "OTP_INVALID");
  }

  const fullName = String(req.body.fullName || req.body.name || "").trim();
  const user = await runDbTransaction(prisma, async (tx) => {
    const existing = await tx.user.findUnique({ where: { phone } });
    if (existing && existing.role !== "CUSTOMER") {
      throw new AppError("Bu raqam xodim hisobi", 403, "FORBIDDEN");
    }
    const provisioned = await provisionCustomer(tx, {
      phone,
      fullName: fullName || existing?.name || "Mijoz",
    });
    return provisioned.user;
  });

  const token = signAccessToken(user);
  await writeAudit(prisma, {
    req,
    user,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    summary: user.phone,
    after: { role: user.role, phone: user.phone },
  });
  return sendSuccess(
    res,
    {
      token,
      tokenType: "Bearer",
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      user: serializeAuthUser(user),
      isNew: !fullName && user.name === "Mijoz",
    },
    "Telefon tasdiqlandi"
  );
});

const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      branchId: true,
      createdAt: true,
      totpEnabled: true,
      mustChangePassword: true,
      status: true,
      lastStreet: true,
      lastApartment: true,
      lastFloor: true,
      lastIntercom: true,
      lastLat: true,
      lastLng: true,
    },
  });

  if (!user) {
    throw new AppError("Foydalanuvchi topilmadi", 404, "NOT_FOUND");
  }

  return sendSuccess(res, serializeAuthUser(user), "Joriy foydalanuvchi");
});

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

const refreshSession = asyncHandler(async (req, res) => {
  const rotated = await rotateAdminSession(req.body.refreshToken);
  if (!rotated) {
    throw new AppError("Sessiya yopilgan yoki muddati tugagan", 401, "UNAUTHORIZED");
  }
  return sendSuccess(
    res,
    {
      token: rotated.token,
      refreshToken: rotated.refreshToken,
      tokenType: "Bearer",
      expiresIn: rotated.expiresIn,
      user: serializeAuthUser(rotated.user),
    },
    "Sessiya yangilandi"
  );
});

const logoutSession = asyncHandler(async (req, res) => {
  if (req.auth?.sid && req.user?.id) {
    await revokeAdminSession(req.user.id, req.auth.sid);
  }
  if (req.user?.id) {
    await writeAudit(prisma, {
      req,
      action: "LOGOUT",
      entityType: "User",
      entityId: req.user.id,
      summary: req.user.phone || req.user.name || req.user.id,
    });
  }
  return sendSuccess(res, { ok: true }, "Chiqildi");
});

const listSessions = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { totpEnabled: true },
  });
  const sessions = await listAdminSessions(req.user.id, req.auth?.sid || null);
  return sendSuccess(res, { totpEnabled: Boolean(user?.totpEnabled), sessions }, "Ochiq sessiyalar");
});

const revokeSession = asyncHandler(async (req, res) => {
  const removed = await revokeAdminSession(req.user.id, req.params.id);
  if (!removed) {
    throw new AppError("Sessiya topilmadi", 404, "NOT_FOUND");
  }
  return sendSuccess(res, { id: req.params.id }, "Sessiya yopildi");
});

const revokeAllSessions = asyncHandler(async (req, res) => {
  await revokeAllAdminSessions(req.user.id);
  return sendSuccess(res, { ok: true }, "Barcha sessiyalar yopildi");
});

const setup2fa = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, phone: true, totpEnabled: true },
  });
  if (!user) throw new AppError("Foydalanuvchi topilmadi", 404, "NOT_FOUND");
  if (user.totpEnabled) {
    throw new AppError("Ikki bosqichli tasdiqlash allaqachon yoqilgan", 409, "CONFLICT");
  }
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecretEnc: encryptSecret(secret), totpEnabled: false },
  });
  return sendSuccess(
    res,
    { secret, otpauthUrl: otpauthUrl(secret, user.phone) },
    "Kalit yaratildi"
  );
});

const enable2fa = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { totpEnabled: true, totpSecretEnc: true },
  });
  if (!user?.totpSecretEnc) {
    throw new AppError("Avval kalit yarating", 400, "VALIDATION_ERROR");
  }
  if (user.totpEnabled) {
    throw new AppError("Ikki bosqichli tasdiqlash allaqachon yoqilgan", 409, "CONFLICT");
  }
  let secret = "";
  try {
    secret = decryptSecret(user.totpSecretEnc);
  } catch {
    secret = "";
  }
  if (!verifyTotp(secret, req.body.code)) {
    throw new AppError("Tasdiqlash kodi noto'g'ri", 401, "UNAUTHORIZED");
  }
  await prisma.user.update({
    where: { id: req.user.id },
    data: { totpEnabled: true },
  });
  return sendSuccess(res, { totpEnabled: true }, "Ikki bosqichli tasdiqlash yoqildi");
});

const disable2fa = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { passwordHash: true, totpEnabled: true, totpSecretEnc: true },
  });
  if (!user?.totpEnabled) {
    throw new AppError("Ikki bosqichli tasdiqlash o'chiq", 400, "VALIDATION_ERROR");
  }
  const matches = await bcrypt.compare(String(req.body.password || ""), user.passwordHash || "");
  if (!matches) {
    throw new AppError("Parol noto'g'ri", 401, "UNAUTHORIZED");
  }
  let secret = "";
  try {
    secret = decryptSecret(user.totpSecretEnc);
  } catch {
    secret = "";
  }
  if (!verifyTotp(secret, req.body.code)) {
    throw new AppError("Tasdiqlash kodi noto'g'ri", 401, "UNAUTHORIZED");
  }
  await prisma.user.update({
    where: { id: req.user.id },
    data: { totpEnabled: false, totpSecretEnc: null },
  });
  return sendSuccess(res, { totpEnabled: false }, "Ikki bosqichli tasdiqlash o'chirildi");
});

const changePassword = asyncHandler(async (req, res) => {
  const nextPassword = String(req.body.newPassword || "");
  if (!isStaffPassword(nextPassword)) {
    throw new AppError(STAFF_PASSWORD_MESSAGE, 400, "VALIDATION_ERROR");
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, passwordHash: true, role: true },
  });
  const matches = await bcrypt.compare(String(req.body.currentPassword || ""), user?.passwordHash || "");
  if (!matches) {
    throw new AppError("Joriy parol noto'g'ri", 401, "UNAUTHORIZED");
  }
  if (req.body.currentPassword === nextPassword) {
    throw new AppError("Yangi parol joriy paroldan farq qilishi kerak", 400, "VALIDATION_ERROR");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(nextPassword, BCRYPT_ROUNDS),
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
    },
  });
  await revokeAllAdminSessions(user.id);
  await writeAudit(prisma, {
    req,
    action: "PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    summary: "Parol yangilandi",
    before: { passwordChanged: false },
    after: { passwordChanged: true },
  });
  return sendSuccess(res, { mustChangePassword: false }, "Parol yangilandi");
});

module.exports = {
  login,
  requestOtp,
  verifyOtpLogin,
  me,
  refreshSession,
  logoutSession,
  listSessions,
  revokeSession,
  revokeAllSessions,
  setup2fa,
  enable2fa,
  disable2fa,
  changePassword,
  hashPassword,
  signAccessToken,
  accessExpiresIn,
  BCRYPT_ROUNDS,
};
