const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { runDbTransaction } = require("../lib/transaction");
const { isStaffRole } = require("./utils");

const BCRYPT_ROUNDS = 10;

function defaultPrisma() {
  return require("../lib/prisma");
}

async function randomPasswordHash() {
  return bcrypt.hash(crypto.randomBytes(32).toString("hex"), BCRYPT_ROUNDS);
}

async function linkTelegramContact({ chatId, phone, firstName }, db = defaultPrisma()) {
  const telegramChatId = String(chatId);
  const existing = await db.user.findUnique({ where: { phone } });

  if (existing && isStaffRole(existing.role)) {
    return { ok: false, code: "STAFF" };
  }
  if (existing && existing.status === "SUSPENDED") {
    return { ok: false, code: "SUSPENDED", reason: existing.blockReason || "" };
  }
  if (existing && existing.deletedAt) {
    return { ok: false, code: "DELETED" };
  }

  if (existing) {
    await runDbTransaction(db, async (tx) => {
      await tx.user.updateMany({
        where: { telegramChatId, NOT: { id: existing.id } },
        data: { telegramChatId: null },
      });
      await tx.user.update({
        where: { id: existing.id },
        data: { telegramChatId },
      });
    });
    return { ok: true, created: false, user: { ...existing, telegramChatId } };
  }

  const name = String(firstName || "").trim() || "Mijoz";
  const passwordHash = await randomPasswordHash();
  const created = await runDbTransaction(db, async (tx) => {
    await tx.user.updateMany({
      where: { telegramChatId },
      data: { telegramChatId: null },
    });
    return tx.user.create({
      data: {
        name,
        phone,
        telegramChatId,
        passwordHash,
        role: "CUSTOMER",
      },
    });
  });
  return { ok: true, created: true, user: created };
}

async function findUserByChatId(chatId, db = defaultPrisma()) {
  const telegramChatId = String(chatId || "").trim();
  if (!telegramChatId) return null;
  return db.user.findUnique({ where: { telegramChatId } });
}

async function findChatIdByPhone(phone, db = defaultPrisma()) {
  if (!phone) return "";
  const user = await db.user.findUnique({
    where: { phone },
    select: { telegramChatId: true, deletedAt: true },
  });
  if (!user || user.deletedAt || !user.telegramChatId) return "";
  return String(user.telegramChatId);
}

module.exports = {
  linkTelegramContact,
  findUserByChatId,
  findChatIdByPhone,
  randomPasswordHash,
};
