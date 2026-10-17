const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const prisma = require("./prisma");
const { getJwtSecret } = require("../middlewares/authMiddleware");
const { usesAdminSession } = require("./permissions");

const REFRESH_MS = 14 * 24 * 60 * 60 * 1000;

function adminAccessTtl() {
  return process.env.ADMIN_JWT_EXPIRES_IN || "12h";
}

function hashRefresh(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function newRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function signAdminAccess(user, sessionId) {
  const expiresIn = adminAccessTtl();
  const token = jwt.sign(
    {
      sub: user.id,
      role: user.role,
      branchId: user.branchId || null,
      sid: sessionId,
      typ: "access",
      tv: Number(user.tokenVersion || 0),
    },
    getJwtSecret(),
    { expiresIn }
  );
  return { token, expiresIn };
}

function clientMeta(req) {
  return {
    userAgent: String(req.headers?.["user-agent"] || "").slice(0, 240) || null,
    ip: String(req.ip || "").slice(0, 64) || null,
  };
}

async function createAdminSession(user, req) {
  const refreshToken = newRefreshToken();
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefresh(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_MS),
      ...clientMeta(req),
    },
  });
  const access = signAdminAccess(user, session.id);
  return { ...access, refreshToken, sessionId: session.id };
}

async function rotateAdminSession(refreshToken) {
  const session = await prisma.authSession.findUnique({
    where: { refreshTokenHash: hashRefresh(refreshToken) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          role: true,
          branchId: true,
          createdAt: true,
          totpEnabled: true,
          status: true,
          deletedAt: true,
          mustChangePassword: true,
          tokenVersion: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  const account = session.user;
  if (!account || !usesAdminSession(account.role) || account.deletedAt || account.status === "SUSPENDED") {
    return null;
  }

  const nextRefresh = newRefreshToken();
  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashRefresh(nextRefresh),
      expiresAt: new Date(Date.now() + REFRESH_MS),
      lastSeenAt: new Date(),
    },
  });

  const access = signAdminAccess(session.user, session.id);
  return { ...access, refreshToken: nextRefresh, user: session.user };
}

async function listAdminSessions(userId, currentSid) {
  const rows = await prisma.authSession.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    current: row.id === currentSid,
  }));
}

async function revokeAdminSession(userId, sessionId) {
  const result = await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

async function revokeAllAdminSessions(userId) {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = {
  adminAccessTtl,
  createAdminSession,
  rotateAdminSession,
  listAdminSessions,
  revokeAdminSession,
  revokeAllAdminSessions,
};
