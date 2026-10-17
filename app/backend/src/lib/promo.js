const { AppError } = require("./response");

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function discountAmount(promo, subtotal) {
  const products = money(subtotal);
  const value = Number(promo.value);
  if (promo.type === "PERCENT") {
    let amount = Math.round(products * value) / 100;
    if (promo.maxDiscount != null && Number(promo.maxDiscount) > 0) {
      amount = Math.min(amount, money(promo.maxDiscount));
    }
    return Math.min(products, money(amount));
  }
  return Math.min(products, money(value));
}

function assertPromo(promo, subtotal, now = new Date(), options = {}) {
  if (!promo || !promo.active) {
    throw new AppError("Promokod yaroqsiz", 400, "PROMO_INVALID");
  }
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now.getTime()) {
    throw new AppError("Promokod hali amal qilmaydi", 400, "PROMO_INVALID");
  }
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < now.getTime()) {
    throw new AppError("Promokod muddati tugagan", 400, "PROMO_INVALID");
  }
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
    throw new AppError("Promokod limiti tugagan", 400, "PROMO_INVALID");
  }
  if (promo.perUserLimit != null && Number(options.userUses || 0) >= promo.perUserLimit) {
    throw new AppError("Bu promokod siz uchun limitga yetgan", 400, "PROMO_INVALID");
  }
  if (promo.allBranches === false) {
    const allowed = new Set((promo.branches || []).map((row) => row.branchId));
    if (!options.branchId || !allowed.has(options.branchId)) {
      throw new AppError("Promokod bu filialda ishlamaydi", 400, "PROMO_INVALID");
    }
  }
  if (Number(subtotal) < Number(promo.minSubtotal || 0)) {
    throw new AppError("Promokod uchun buyurtma summasi yetarli emas", 400, "PROMO_INVALID");
  }
  return discountAmount(promo, subtotal);
}

async function userUseCount(tx, promoId, userId) {
  if (!userId) return 0;
  return tx.promoRedemption.count({
    where: { promoId, userId, releasedAt: null },
  });
}

async function claimPromo(tx, { code, subtotal, branchId, userId }) {
  const found = await tx.promoCode.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!found) {
    throw new AppError("Promokod yaroqsiz", 400, "PROMO_INVALID");
  }
  await tx.$queryRaw`SELECT id FROM "PromoCode" WHERE id = ${found.id} FOR UPDATE`;
  const promo = await tx.promoCode.findUnique({
    where: { id: found.id },
    include: { branches: { select: { branchId: true } } },
  });
  const userUses = promo.perUserLimit == null ? 0 : await userUseCount(tx, promo.id, userId);
  const discount = assertPromo(promo, subtotal, new Date(), { branchId, userUses });
  const claimed = await tx.promoCode.updateMany({
    where: {
      id: promo.id,
      active: true,
      ...(promo.usageLimit == null ? {} : { usedCount: { lt: promo.usageLimit } }),
    },
    data: { usedCount: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    throw new AppError("Promokod limiti tugagan", 400, "PROMO_INVALID");
  }
  return { id: promo.id, code: promo.code, discount };
}

async function attachRedemption(tx, { promoId, orderId, userId, discount }) {
  await tx.promoRedemption.create({
    data: { promoId, orderId, userId: userId || null, discount },
  });
}

async function releasePromo(tx, order) {
  if (!order?.id && !order?.promoCode) return;
  const row = order.id
    ? await tx.promoRedemption.findUnique({ where: { orderId: order.id } })
    : null;
  if (row) {
    if (row.releasedAt) return;
    const claimed = await tx.promoRedemption.updateMany({
      where: { id: row.id, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    if (claimed.count !== 1) return;
    await tx.promoCode.updateMany({
      where: { id: row.promoId, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
    return;
  }
  if (!order.promoCode) return;
  await tx.promoCode.updateMany({
    where: { code: String(order.promoCode).trim().toUpperCase(), usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}

async function reclaimPromo(tx, order) {
  if (!order?.id && !order?.promoCode) return;
  const row = order.id
    ? await tx.promoRedemption.findUnique({ where: { orderId: order.id } })
    : null;
  if (row) {
    if (!row.releasedAt) return;
    await tx.$queryRaw`SELECT id FROM "PromoCode" WHERE id = ${row.promoId} FOR UPDATE`;
    const promo = await tx.promoCode.findUnique({ where: { id: row.promoId } });
    if (!promo) return;
    if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
      throw new AppError("Promokod limiti tugagan", 409, "PROMO_INVALID");
    }
    const uses = promo.perUserLimit == null ? 0 : await userUseCount(tx, promo.id, row.userId);
    if (promo.perUserLimit != null && uses >= promo.perUserLimit) {
      throw new AppError("Bu promokod siz uchun limitga yetgan", 409, "PROMO_INVALID");
    }
    const claimed = await tx.promoRedemption.updateMany({
      where: { id: row.id, releasedAt: { not: null } },
      data: { releasedAt: null },
    });
    if (claimed.count === 1) {
      await tx.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });
    }
    return;
  }
  if (!order.promoCode) return;
  const promo = await tx.promoCode.findUnique({
    where: { code: String(order.promoCode).trim().toUpperCase() },
  });
  if (!promo) return;
  const claimed = await tx.promoCode.updateMany({
    where: {
      id: promo.id,
      ...(promo.usageLimit == null ? {} : { usedCount: { lt: promo.usageLimit } }),
    },
    data: { usedCount: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    throw new AppError("Promokod limiti tugagan", 409, "PROMO_INVALID");
  }
}

module.exports = {
  discountAmount,
  assertPromo,
  claimPromo,
  attachRedemption,
  releasePromo,
  reclaimPromo,
};
