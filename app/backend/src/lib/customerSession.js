const crypto = require("crypto");
const prisma = require("./prisma");
const { runDbTransaction } = require("./transaction");

const COOKIE = "vita_refresh";
const DAYS = 30;

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function readCookie(req, name = COOKIE) {
  const raw = String(req?.headers?.cookie || "");
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function cookieHeader(token, clear = false) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure; SameSite=None" : "; SameSite=Lax";
  const maxAge = clear ? 0 : DAYS * 24 * 60 * 60;
  const value = clear ? "" : encodeURIComponent(token);
  return `${COOKIE}=${value}; HttpOnly; Path=/api/auth; Max-Age=${maxAge}${secure}`;
}

async function issueCustomerRefresh(user) {
  const raw = crypto.randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return raw;
}

async function rotateCustomerRefresh(raw) {
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  return runDbTransaction(prisma, async (tx) => {
    const row = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
    if (!row.user || row.user.deletedAt || row.user.status === "SUSPENDED" || row.user.role !== "CUSTOMER") return null;
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const next = crypto.randomBytes(32).toString("base64url");
    const created = await tx.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: hashToken(next),
        expiresAt: new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000),
      },
    });
    await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: created.id } });
    return { user: row.user, refreshToken: next };
  });
}

async function revokeCustomerRefresh(raw) {
  if (!raw) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = {
  COOKIE,
  readCookie,
  cookieHeader,
  issueCustomerRefresh,
  rotateCustomerRefresh,
  revokeCustomerRefresh,
};
