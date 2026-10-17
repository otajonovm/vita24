const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { writeAudit } = require("../lib/audit");

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function promoData(body) {
  return {
    code: body.code,
    type: body.type,
    value: money(body.value),
    maxDiscount: body.maxDiscount ? money(body.maxDiscount) : null,
    minSubtotal: money(body.minSubtotal || 0),
    usageLimit: body.usageLimit ?? null,
    perUserLimit: body.perUserLimit ?? null,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    active: body.active === true,
    allBranches: body.allBranches === true,
  };
}

function promoAudit(promo) {
  return {
    code: promo.code,
    type: promo.type,
    value: money(promo.value),
    maxDiscount: promo.maxDiscount == null ? null : money(promo.maxDiscount),
    minSubtotal: money(promo.minSubtotal),
    usageLimit: promo.usageLimit,
    perUserLimit: promo.perUserLimit,
    active: promo.active,
    allBranches: promo.allBranches,
    startsAt: promo.startsAt,
    expiresAt: promo.expiresAt,
    branchIds: (promo.branches || []).map((row) => row.branchId).sort(),
  };
}

function serializePromo(promo, stats) {
  return {
    id: promo.id,
    code: promo.code,
    type: promo.type,
    value: money(promo.value),
    maxDiscount: promo.maxDiscount == null ? null : money(promo.maxDiscount),
    minSubtotal: money(promo.minSubtotal),
    usageLimit: promo.usageLimit,
    perUserLimit: promo.perUserLimit,
    usedCount: promo.usedCount,
    timesUsed: promo.usedCount,
    totalDiscount: money(stats?.discount || 0),
    startsAt: promo.startsAt,
    expiresAt: promo.expiresAt,
    active: promo.active,
    allBranches: promo.allBranches,
    branchIds: (promo.branches || []).map((row) => row.branchId),
  };
}

async function discountTotals() {
  const rows = await prisma.order.groupBy({
    by: ["promoCode"],
    where: { promoCode: { not: null }, status: { not: "CANCELLED" } },
    _sum: { discount: true },
  });
  return new Map(rows.map((row) => [row.promoCode, Number(row._sum.discount) || 0]));
}

async function assertBranches(ids) {
  if (!ids.length) return;
  const found = await prisma.branch.count({ where: { id: { in: ids } } });
  if (found !== ids.length) {
    throw new AppError("Filial topilmadi", 400, "VALIDATION_ERROR");
  }
}

const listPromos = asyncHandler(async (req, res) => {
  const [rows, totals] = await Promise.all([
    prisma.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { branches: { select: { branchId: true } } },
    }),
    discountTotals(),
  ]);
  return sendSuccess(
    res,
    rows.map((row) => serializePromo(row, { discount: totals.get(row.code) || 0 })),
    "Promokodlar"
  );
});

const createPromo = asyncHandler(async (req, res) => {
  const taken = await prisma.promoCode.findUnique({ where: { code: req.body.code }, select: { id: true } });
  if (taken) throw new AppError("Bu kod band", 409, "CONFLICT");
  const branchIds = req.body.allBranches ? [] : req.body.branchIds;
  await assertBranches(branchIds);
  const created = await prisma.promoCode.create({
    data: {
      ...promoData(req.body),
      ...(branchIds.length ? { branches: { create: branchIds.map((branchId) => ({ branchId })) } } : {}),
    },
    include: { branches: { select: { branchId: true } } },
  });
  await writeAudit(prisma, {
    req,
    action: "PROMO_CREATED",
    entityType: "PromoCode",
    entityId: created.id,
    summary: created.code,
    after: promoAudit(created),
  });
  return sendSuccess(res, serializePromo(created, { discount: 0 }), "Promokod qo'shildi", 201);
});

const updatePromo = asyncHandler(async (req, res) => {
  const existing = await prisma.promoCode.findUnique({
    where: { id: req.params.id },
    include: { branches: { select: { branchId: true } } },
  });
  if (!existing) throw new AppError("Promokod topilmadi", 404, "NOT_FOUND");
  if (req.body.code !== existing.code) {
    const taken = await prisma.promoCode.findUnique({ where: { code: req.body.code }, select: { id: true } });
    if (taken) throw new AppError("Bu kod band", 409, "CONFLICT");
  }
  const branchIds = req.body.allBranches ? [] : req.body.branchIds;
  await assertBranches(branchIds);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.promoBranch.deleteMany({ where: { promoId: existing.id } });
    return tx.promoCode.update({
      where: { id: existing.id },
      data: {
        ...promoData(req.body),
        ...(branchIds.length ? { branches: { create: branchIds.map((branchId) => ({ branchId })) } } : {}),
      },
      include: { branches: { select: { branchId: true } } },
    });
  });
  const totals = await discountTotals();
  await writeAudit(prisma, {
    req,
    action: "PROMO_UPDATED",
    entityType: "PromoCode",
    entityId: updated.id,
    summary: updated.code,
    before: promoAudit(existing),
    after: promoAudit(updated),
  });
  return sendSuccess(res, serializePromo(updated, { discount: totals.get(updated.code) || 0 }), "Promokod saqlandi");
});

const setPromoActive = asyncHandler(async (req, res) => {
  const existing = await prisma.promoCode.findUnique({
    where: { id: req.params.id },
    include: { branches: { select: { branchId: true } } },
  });
  if (!existing) throw new AppError("Promokod topilmadi", 404, "NOT_FOUND");
  const updated = await prisma.promoCode.update({
    where: { id: existing.id },
    data: { active: req.body.active === true },
    include: { branches: { select: { branchId: true } } },
  });
  const totals = await discountTotals();
  await writeAudit(prisma, {
    req,
    action: updated.active ? "PROMO_ACTIVATED" : "PROMO_DEACTIVATED",
    entityType: "PromoCode",
    entityId: updated.id,
    summary: updated.code,
    before: { active: existing.active },
    after: { active: updated.active },
  });
  return sendSuccess(res, serializePromo(updated, { discount: totals.get(updated.code) || 0 }), "Promokod holati saqlandi");
});

const deletePromo = asyncHandler(async (req, res) => {
  const existing = await prisma.promoCode.findUnique({
    where: { id: req.params.id },
    select: { id: true, code: true, usedCount: true, _count: { select: { redemptions: true } } },
  });
  if (!existing) throw new AppError("Promokod topilmadi", 404, "NOT_FOUND");
  if (existing.usedCount > 0 || existing._count.redemptions > 0) {
    throw new AppError("Ishlatilgan kod o'chirilmaydi. Nofaol qiling.", 409, "CONFLICT");
  }
  await prisma.promoCode.delete({ where: { id: existing.id } });
  await writeAudit(prisma, {
    req,
    action: "PROMO_DELETED",
    entityType: "PromoCode",
    entityId: existing.id,
    summary: existing.code,
    before: { code: existing.code, usedCount: existing.usedCount },
    after: { deleted: true },
  });
  return sendSuccess(res, { id: existing.id }, "Promokod o'chirildi");
});

module.exports = {
  listPromos,
  createPromo,
  updatePromo,
  setPromoActive,
  deletePromo,
};
