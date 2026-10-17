const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { hasPermission, rolesWith, usesAdminSession } = require("../lib/permissions");
const { AppError, sendError } = require("../lib/response");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error("JWT_SECRET muhit o'zgaruvchisi sozlanmagan");
  }
  return secret;
}

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== "string") return null;

  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

async function authenticateToken(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return sendError(res, 401, "UNAUTHORIZED", "Autentifikatsiya tokeni talab qilinadi");
    }

    let payload;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch {
      return sendError(res, 401, "UNAUTHORIZED", "Token yaroqsiz yoki muddati tugagan");
    }

    const userId = payload?.sub || payload?.userId || payload?.id;
    if (!userId) {
      return sendError(res, 401, "UNAUTHORIZED", "Token yaroqsiz");
    }

    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        branchId: true,
        status: true,
        deletedAt: true,
        mustChangePassword: true,
        tokenVersion: true,
      },
    });

    if (!user || user.deletedAt) {
      return sendError(res, 401, "UNAUTHORIZED", "Foydalanuvchi topilmadi");
    }

    if (user.status === "SUSPENDED" && user.role !== "CUSTOMER") {
      return sendError(res, 401, "UNAUTHORIZED", "Hisob to'xtatilgan");
    }

    const tokenVersion = Number(payload.tv ?? 0);
    if (Number(user.tokenVersion || 0) !== tokenVersion) {
      return sendError(res, 401, "UNAUTHORIZED", "Token bekor qilingan");
    }

    if (usesAdminSession(user.role)) {
      if (!payload.sid) {
        return sendError(res, 401, "UNAUTHORIZED", "Token yaroqsiz yoki muddati tugagan");
      }
      const session = await prisma.authSession.findUnique({
        where: { id: String(payload.sid) },
      });
      const closed =
        !session ||
        session.userId !== user.id ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now();
      if (closed) {
        return sendError(res, 401, "UNAUTHORIZED", "Sessiya yopilgan yoki muddati tugagan");
      }
      if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
        prisma.authSession
          .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
          .catch(() => {});
      }
    }

    const path = String(req.originalUrl || "");
    const passwordReset =
      path.includes("/auth/change-password") || path.includes("/auth/logout") || path.includes("/auth/me");
    if (user.mustChangePassword && !passwordReset) {
      return sendError(res, 403, "PASSWORD_CHANGE_REQUIRED", "Avval parolni o'zgartiring");
    }

    req.user = user;
    req.auth = { sid: payload.sid || null };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...roles) {
  const allowed = roles.flat().filter(Boolean);

  function roleGuard(req, res, next) {
    if (!req.user) {
      return sendError(res, 401, "UNAUTHORIZED", "Autentifikatsiya talab qilinadi");
    }

    if (!allowed.includes(req.user.role)) {
      return sendError(res, 403, "FORBIDDEN", "Bu amal uchun ruxsat yo'q");
    }

    return next();
  }

  roleGuard.allowedRoles = allowed;
  return roleGuard;
}

function requirePermission(permission) {
  const allowed = rolesWith(permission);

  function permissionGuard(req, res, next) {
    if (!req.user) {
      return sendError(res, 401, "UNAUTHORIZED", "Autentifikatsiya talab qilinadi");
    }
    if (!hasPermission(req.user.role, permission)) {
      return sendError(res, 403, "FORBIDDEN", "Bu amal uchun ruxsat yo'q");
    }
    return next();
  }

  permissionGuard.allowedRoles = allowed;
  return permissionGuard;
}

/**
 * BRANCH_ADMIN faqat o'z filialiga kirishi mumkin.
 * SUPER_ADMIN / MANAGER — istalgan filialni faqat o'qishda ko'ra oladi.
 * @param {{ write?: boolean }} [options]
 * @returns {string|null} samarali branchId
 */
function assertBranchAccess(req, requestedBranchId, options = {}) {
  if (!req.user) {
    throw new AppError("Autentifikatsiya talab qilinadi", 401, "UNAUTHORIZED");
  }

  const write = Boolean(options.write);

  if (req.user.role === "BRANCH_ADMIN") {
    if (!req.user.branchId) {
      throw new AppError("Filial biriktirilmagan admin", 403, "FORBIDDEN");
    }

    if (requestedBranchId && String(requestedBranchId) !== req.user.branchId) {
      throw new AppError("Boshqa filial ma'lumotlariga ruxsat yo'q", 403, "FORBIDDEN");
    }

    return req.user.branchId;
  }

  if (req.user.role === "SUPER_ADMIN" || req.user.role === "MANAGER" || hasPermission(req.user.role, "orders.read")) {
    if (write) {
      throw new AppError("Bu amal faqat filial farmatsevti uchun", 403, "FORBIDDEN");
    }
    return requestedBranchId ? String(requestedBranchId) : null;
  }

  throw new AppError("Bu amal uchun ruxsat yo'q", 403, "FORBIDDEN");
}

/** Filial paneli yozuv amallari — faqat BRANCH_ADMIN */
function requireBranchAdminWrite(req, res, next) {
  if (!req.user) {
    return sendError(res, 401, "UNAUTHORIZED", "Autentifikatsiya talab qilinadi");
  }
  if (req.user.role !== "BRANCH_ADMIN") {
    return sendError(res, 403, "FORBIDDEN", "Bu amal faqat filial farmatsevti uchun");
  }
  return next();
}

module.exports = {
  authenticateToken,
  requireRole,
  requirePermission,
  assertBranchAccess,
  requireBranchAdminWrite,
  getJwtSecret,
};
