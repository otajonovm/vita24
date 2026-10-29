const { Prisma } = require("../../generated/prisma");
const prisma = require("../lib/prisma");
const { runDbTransaction } = require("../lib/transaction");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const {
  availableCount,
  captureStock,
  expireStaleReservations,
  releaseReservation,
  reservationDeadline,
  reserveStock,
} = require("../lib/stock");
const { serializeUser } = require("../lib/userProvisioning");
const { assertBranchAccess } = require("../middlewares/authMiddleware");
const { syncBranchStock } = require("../services/lekkoService");
const { medicineSearchSql } = require("../lib/search");
const { settledTotals } = require("../lib/pricing");
const { publish, subscribe } = require("../lib/panelEvents");
const { unpaidCash } = require("../lib/orderState");
const {
  REJECT_LABELS,
  canUndo,
  freeForLine,
  pageWindow,
  rejectText,
  reviewBlockReason,
  stockCountError,
} = require("../lib/panelRules");
const { emitOrder, notifyStatus, undoBlockReason, undoEffects, writeHistory } = require("../lib/orderFlow");
const { reclaimPromo, releasePromo } = require("../lib/promo");
const { writeAudit } = require("../lib/audit");
const { formatWorkingHours } = require("../lib/branchProfile");
const { applyOrderStatusChange } = require("../services/orderStatusService");
const { assignOrderCourier } = require("../services/courierService");

const REVIEW_STATUSES = ["PENDING_PRESCRIPTION", "PENDING_BRANCH"];
const PAID_LIKE = ["PAID", "PREPARING", "READY", "DELIVERING", "COMPLETED"];
const LOW_STOCK_THRESHOLD = 5;

const orderInclude = {
  branch: {
    select: { id: true, name: true, district: true, address: true, phone: true, workingHours: true, isOpen: true },
  },
  items: {
    include: {
      medicine: { select: { name: true, slug: true, dosageForm: true, isPrescription: true } },
    },
  },
  prescription: true,
  payment: true,
  courier: { select: { id: true, name: true, phone: true, status: true } },
  user: { select: { id: true, name: true, phone: true, role: true } },
  history: { orderBy: { createdAt: "desc" }, take: 30 },
};

async function requireActiveBranch(branchId) {
  if (!branchId) {
    throw new AppError("branchId so'rov parametri majburiy", 400, "VALIDATION_ERROR");
  }

  const branch = await prisma.branch.findUnique({ where: { id: String(branchId) } });
  if (!branch) {
    throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  }

  return branch;
}

function prescriptionRejectNote(prescription, orderNotes) {
  if (!prescription) return null;
  if (prescription.rejectNote) return prescription.rejectNote;
  if (prescription.status === "REJECTED") return orderNotes || null;
  return null;
}

function publicBranch(branch) {
  if (!branch) return null;
  return {
    id: branch.id,
    name: branch.name,
    district: branch.district,
    address: branch.address || "",
    phone: branch.phone || "",
    workingHours: formatWorkingHours(branch.workingHours),
    isOpen: branch.isOpen !== false,
    hasLekkoKey: Boolean(branch.lekkoApiKey && String(branch.lekkoApiKey).trim()),
    lastSyncedAt: branch.lastSyncedAt || null,
  };
}

function undoUntil(order, viewerId) {
  const last = order.history?.[0];
  if (!last || !canUndo(last, viewerId)) return null;
  return new Date(new Date(last.createdAt).getTime() + 30 * 1000).toISOString();
}

function serializeBranchOrder(order, viewerId) {
  const rejectNote = prescriptionRejectNote(order.prescription, order.notes);
  const cancelNote =
    order.status === "CANCELLED" && order.prescription?.status !== "REJECTED" ? order.notes : null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    deliveryType: order.deliveryType || "DELIVERY",
    promoCode: order.promoCode || null,
    ...settledTotals(order),
    reservedUntil: order.reservedUntil,
    createdAt: order.createdAt,
    statusChangedAt: order.statusChangedAt,
    notes: order.notes,
    pharmacistNote: order.pharmacistNote || "",
    refundStatus: order.refundStatus || "NONE",
    undoUntil: undoUntil(order, viewerId),
    hasPrescription: Boolean(order.prescription),
    user: order.user ? serializeUser(order.user) : null,
    branch: order.branch
      ? {
          id: order.branch.id,
          name: order.branch.name,
          district: order.branch.district,
          address: order.branch.address || "",
          phone: order.branch.phone || "",
          workingHours: formatWorkingHours(order.branch.workingHours),
          isOpen: order.branch.isOpen !== false,
        }
      : null,
    items: (order.items || []).map((item) => ({
      id: item.id,
      medicineId: item.medicineId,
      name: item.medicine?.name || "",
      dosageForm: item.medicine?.dosageForm || "",
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.unitPrice) * item.quantity,
      isPrescription: Boolean(item.isPrescription || item.medicine?.isPrescription),
    })),
    prescription: order.prescription
      ? {
          id: order.prescription.id,
          fileName: order.prescription.fileName,
          fileUrl: null,
          status: order.prescription.status,
          rejectNote: prescriptionRejectNote(order.prescription, order.notes),
          rejectReasons: order.prescription.rejectReasons || "",
        }
      : null,
    payment: order.payment
      ? {
          id: order.payment.id,
          amount: Number(order.payment.amount),
          status: order.payment.status,
          provider: order.payment.provider,
          paidAt: order.payment.paidAt,
        }
      : null,
    history: (order.history || []).map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      userId: row.userId,
      note: row.note,
      kind: row.kind || "status",
      createdAt: row.createdAt,
    })),
    cancelReason: rejectNote || cancelNote,
    courierId: order.courierId || null,
    courierStage: order.courierStage || "UNASSIGNED",
    assignedAt: order.assignedAt || null,
    pickedUpAt: order.pickedUpAt || null,
    deliveredAt: order.deliveredAt || null,
    deliveryFailReason: order.deliveryFailReason || null,
    courier: order.courier
      ? { id: order.courier.id, name: order.courier.name, phone: order.courier.phone, status: order.courier.status }
      : null,
  };
}

const stockMedicineSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  manufacturer: true,
  dosageForm: true,
  barcode: true,
  ikpuCode: true,
  quantityInPack: true,
  imageUrl: true,
  isPrescription: true,
  category: { select: { id: true, name: true, slug: true } },
};

function serializeStockRow(stock, threshold = LOW_STOCK_THRESHOLD) {
  const available = availableCount(stock);
  const limit = Number(threshold) || LOW_STOCK_THRESHOLD;
  return {
    id: stock.id,
    branchId: stock.branchId,
    medicineId: stock.medicineId,
    name: stock.medicine?.name || "",
    slug: stock.medicine?.slug || "",
    description: stock.medicine?.description || "",
    manufacturer: stock.medicine?.manufacturer || "",
    dosageForm: stock.medicine?.dosageForm || "",
    barcode: stock.medicine?.barcode || null,
    ikpuCode: stock.medicine?.ikpuCode || null,
    quantityInPack: stock.medicine?.quantityInPack || 1,
    imageUrl: stock.medicine?.imageUrl || null,
    isPrescription: Boolean(stock.medicine?.isPrescription),
    category: stock.medicine?.category
      ? {
          id: stock.medicine.category.id,
          name: stock.medicine.category.name,
          slug: stock.medicine.category.slug,
        }
      : null,
    price: Number(stock.price),
    stockCount: stock.stockCount,
    reservedCount: stock.reservedCount,
    available,
    lowStock: available > 0 && available < limit,
  };
}

function tashkentDayStart() {
  const offset = 5 * 60 * 60 * 1000;
  const shifted = new Date(Date.now() + offset);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - offset);
}

function rangeStart(range) {
  const today = tashkentDayStart();
  if (range === "7") return new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  if (range === "30") return new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
  return today;
}

function endOfDay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setHours(23, 59, 59, 999);
  return date;
}

function orderFilters(branchId, query) {
  const where = { branchId };
  const and = [];
  const search = String(query.search || "").trim();
  if (search) {
    and.push({
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customerPhone: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  const from = query.from ? new Date(query.from) : null;
  const to = endOfDay(query.to);
  if (from && !Number.isNaN(from.getTime())) where.createdAt = { ...(where.createdAt || {}), gte: from };
  if (to) where.createdAt = { ...(where.createdAt || {}), lte: to };
  if (and.length) where.AND = and;
  return where;
}

function withStatus(where, status) {
  const next = { ...where, AND: [...(where.AND || [])] };
  if (!status) return next;
  if (status === "review") {
    next.status = { in: REVIEW_STATUSES };
  } else if (status === "rejected") {
    next.status = "CANCELLED";
    next.AND.push({ prescription: { status: "REJECTED" } });
  } else if (status === "cancelled") {
    next.status = "CANCELLED";
    next.AND.push({
      OR: [{ prescription: null }, { prescription: { status: { not: "REJECTED" } } }],
    });
  } else if (status === "failed_delivery") {
    next.status = "READY";
    next.courierStage = "FAILED";
  } else {
    next.status = status;
  }
  return next;
}

async function statusCounts(where) {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
  const rejected = await prisma.order.count({
    where: { ...where, status: "CANCELLED", prescription: { status: "REJECTED" } },
  });
  const cancelledAll = byStatus.CANCELLED || 0;
  const failedDelivery = await prisma.order.count({
    where: { ...where, status: "READY", courierStage: "FAILED" },
  });
  return {
    all: grouped.reduce((sum, row) => sum + row._count._all, 0),
    review: (byStatus.PENDING_PRESCRIPTION || 0) + (byStatus.PENDING_BRANCH || 0),
    WAITING_PAYMENT: byStatus.WAITING_PAYMENT || 0,
    PAID: byStatus.PAID || 0,
    PREPARING: byStatus.PREPARING || 0,
    READY: Math.max((byStatus.READY || 0) - failedDelivery, 0),
    failed_delivery: failedDelivery,
    DELIVERING: byStatus.DELIVERING || 0,
    COMPLETED: byStatus.COMPLETED || 0,
    rejected,
    cancelled: Math.max(cancelledAll - rejected, 0),
  };
}

const listBranchOrders = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const scopedBranchId = assertBranchAccess(req, req.query.branchId);
  const branch = await requireActiveBranch(scopedBranchId || req.query.branchId);
  const { page, limit, skip } = pageWindow(req.query);
  const base = orderFilters(branch.id, req.query);
  const where = withStatus(base, req.query.status || "");
  const sort = req.query.sort || "urgent";
  const [total, orders, counts] = await Promise.all([
    prisma.order.count({ where }),
    loadOrderPage(where, sort, skip, limit),
    statusCounts(base),
  ]);

  const ranked = orders;

  return sendSuccess(
    res,
    {
      branch: publicBranch(branch),
      total,
      page,
      limit,
      hasMore: skip + orders.length < total,
      counts,
      orders: ranked.map((order) => serializeBranchOrder(order, req.user.id)),
    },
    "Filial buyurtmalari"
  );
});

const ACTIVE_QUEUE = [
  "PENDING_PRESCRIPTION",
  "PENDING_BRANCH",
  "WAITING_PAYMENT",
  "PAID",
  "PREPARING",
  "READY",
  "DELIVERING",
];

async function loadOrderPage(where, sort, skip, limit) {
  if (sort === "oldest" || sort === "newest") {
    return prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
      skip,
      take: limit,
    });
  }

  const activeWhere = {
    ...where,
    AND: [...(where.AND || []), { status: { in: ACTIVE_QUEUE } }],
  };
  const restWhere = {
    ...where,
    AND: [...(where.AND || []), { status: { in: ["COMPLETED", "CANCELLED"] } }],
  };
  const activeCount = await prisma.order.count({ where: activeWhere });
  const orders = [];
  if (skip < activeCount) {
    orders.push(
      ...(await prisma.order.findMany({
        where: activeWhere,
        include: orderInclude,
        orderBy: [{ reservedUntil: "asc" }, { createdAt: "asc" }],
        skip,
        take: limit,
      }))
    );
  }
  if (orders.length < limit) {
    orders.push(
      ...(await prisma.order.findMany({
        where: restWhere,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: Math.max(0, skip - activeCount),
        take: limit - orders.length,
      }))
    );
  }
  return orders;
}

const verifyPrescription = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const orderId = req.params.id;
  const action = String(req.body?.action || "").toUpperCase();
  const approved = action === "APPROVE";
  const codes = Array.isArray(req.body?.rejectReasons) ? req.body.rejectReasons : [];
  const rejectNote = rejectText(codes, req.body?.rejectNote);

  const updated = await runDbTransaction(prisma, async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { medicine: { select: { name: true } } } },
        prescription: true,
        payment: true,
      },
    });

    if (!current) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
    assertBranchAccess(req, current.branchId, { write: true });

    const block = reviewBlockReason(current);
    if (block) throw new AppError(block, 409, "INVALID_STATUS");
    if (!approved && current.status === "CANCELLED") {
      throw new AppError("Bekor qilingan buyurtmani rad etib bo'lmaydi", 409, "INVALID_STATUS");
    }

    // Retsept yo'li — to'g'ridan-to'g'ri status API orqali emas
    const payLater = ["CASH", "CARD_TERMINAL"].includes(String(current.payment?.provider || "").toUpperCase());
    const cash = payLater;
    const nextStatus = approved ? (cash ? "PREPARING" : "WAITING_PAYMENT") : "CANCELLED";
    const reopening = current.status === "CANCELLED";

    if (approved) {
      for (const item of current.items) {
        const stock = await tx.branchStock.findUnique({
          where: { branchId_medicineId: { branchId: current.branchId, medicineId: item.medicineId } },
        });
        const held = reopening ? 0 : item.quantity;
        const free = freeForLine(stock, held);
        const name = item.medicine?.name || "Dori";
        if (!stock || free < item.quantity) {
          throw new AppError(
            `${name} omborda yetarli emas: kerak ${item.quantity}, bo'sh ${Math.max(0, free)}`,
            409,
            "INSUFFICIENT_STOCK"
          );
        }
      }

      if (reopening) {
        for (const item of current.items) {
          await reserveStock(tx, {
            branchId: current.branchId,
            medicineId: item.medicineId,
            quantity: item.quantity,
            medicineName: item.medicine?.name,
          });
        }
      }

      if (cash) await captureStock(tx, current);

      const claimed = await tx.order.updateMany({
        where: { id: current.id, status: reopening ? "CANCELLED" : { in: REVIEW_STATUSES } },
        data: {
          status: nextStatus,
          reservedUntil: cash ? current.reservedUntil : reservationDeadline("payment", current.checkoutRules),
          statusChangedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new AppError("Bu buyurtma farmatsevt tasdig'ini kutmayapti", 409, "INVALID_STATUS");
      }
      if (reopening) await reclaimPromo(tx, current);
      if (current.prescription) {
        await tx.prescription.update({
          where: { id: current.prescription.id },
          data: { status: "APPROVED", rejectNote: null, rejectReasons: null },
        });
      }
    } else {
      const claimed = await tx.order.updateMany({
        where: { id: current.id, status: { in: REVIEW_STATUSES } },
        data: { status: "CANCELLED", statusChangedAt: new Date(), refundStatus: "NONE" },
      });
      if (claimed.count !== 1) {
        throw new AppError("Bu buyurtma farmatsevt tasdig'ini kutmayapti", 409, "INVALID_STATUS");
      }
      await releaseReservation(tx, current);
      await releasePromo(tx, current);
      if (current.prescription) {
        await tx.prescription.update({
          where: { id: current.prescription.id },
          data: { status: "REJECTED", rejectNote, rejectReasons: JSON.stringify(codes) },
        });
      }
      if (current.payment && current.payment.status !== "COMPLETED") {
        await tx.paymentTransaction.update({
          where: { id: current.payment.id },
          data: { status: "FAILED" },
        });
      }
    }

    await writeHistory(tx, {
      orderId: current.id,
      fromStatus: current.status,
      toStatus: nextStatus,
      userId: req.user.id,
      note: approved ? null : rejectNote,
    });

    await writeAudit(tx, {
      req,
      action: approved ? "PRESCRIPTION_APPROVED" : "PRESCRIPTION_REJECTED",
      entityType: "Order",
      entityId: current.id,
      branchId: current.branchId,
      summary: approved
        ? `${current.orderNumber} retsepti tasdiqlandi`
        : `${current.orderNumber} retsepti rad etildi. ${rejectNote}`,
      before: { status: current.status, prescription: current.prescription?.status || null },
      after: { status: nextStatus, prescription: approved ? "APPROVED" : "REJECTED" },
    });

    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });

  emitOrder(updated.branchId, updated);
  if (!approved) notifyStatus(updated, "CANCELLED", `Retsept rad etildi. Sabab: ${rejectNote}`);
  else if (updated.status === "PREPARING") notifyStatus(updated, "PREPARING");
  else if (updated.status === "WAITING_PAYMENT") notifyStatus(updated, "WAITING_PAYMENT");

  return sendSuccess(
    res,
    serializeBranchOrder(updated, req.user.id),
    approved
      ? updated.status === "PREPARING"
        ? "Retsept tasdiqlandi, yig'ish boshlandi"
        : "Retsept tasdiqlandi, to'lov ochildi"
      : "Retsept rad etildi, zaxira qaytarildi"
  );
});

function stockConditionSql(branchId, { search, filter, barcode, threshold }) {
  const limit = Number(threshold) || LOW_STOCK_THRESHOLD;
  const parts = [
    Prisma.sql`s."branchId" = ${branchId}`,
    Prisma.sql`NOT (s."stockCount" = 0 AND s."reservedCount" = 0 AND s.price = 0 AND m."externalApiId" IS NOT NULL)`,
  ];
  if (search) parts.push(medicineSearchSql(search));
  if (barcode) parts.push(Prisma.sql`m.barcode = ${barcode}`);
  if (filter === "low") {
    parts.push(
      Prisma.sql`(s."stockCount" - s."reservedCount") > 0 AND (s."stockCount" - s."reservedCount") < ${limit}`
    );
  } else if (filter === "out") {
    parts.push(Prisma.sql`(s."stockCount" - s."reservedCount") <= 0`);
  } else if (filter === "rx") {
    parts.push(Prisma.sql`m."isPrescription" = true`);
  }
  return Prisma.join(parts, " AND ");
}

async function applyStockChange(tx, req, { stockId, nextCount, reason, note }) {
  const invalid = stockCountError(nextCount);
  if (invalid) throw new AppError(invalid, 400, "VALIDATION_ERROR");

  const current = await tx.branchStock.findUnique({
    where: { id: stockId },
    include: { medicine: { select: stockMedicineSelect } },
  });
  if (!current) throw new AppError("Ombor yozuvi topilmadi", 404, "NOT_FOUND");
  assertBranchAccess(req, current.branchId, { write: true });
  if (nextCount < current.reservedCount) {
    throw new AppError(
      `Qoldiq band qilingan zaxiradan (${current.reservedCount}) kichik bo'lishi mumkin emas`,
      409,
      "STOCK_BELOW_RESERVED"
    );
  }
  const delta = nextCount - current.stockCount;
  if (delta === 0) throw new AppError("Qoldiq o'zgarmagan", 400, "VALIDATION_ERROR");

  const updated = await tx.branchStock.update({
    where: { id: current.id },
    data: { stockCount: nextCount },
    include: { medicine: { select: stockMedicineSelect } },
  });
  await tx.stockMovement.create({
    data: {
      branchStockId: current.id,
      userId: req.user.id,
      delta,
      beforeCount: current.stockCount,
      afterCount: nextCount,
      reason,
      note: note || null,
    },
  });
  await writeAudit(tx, {
    req,
    action: "STOCK_ADJUST",
    entityType: "BranchStock",
    entityId: current.id,
    branchId: current.branchId,
    summary: `${current.medicine?.name || current.id}: ${current.stockCount} → ${nextCount}`,
    before: { stockCount: current.stockCount },
    after: { stockCount: nextCount, reason, note: note || null },
  });
  return updated;
}

const listBranchStock = asyncHandler(async (req, res) => {
  const scopedBranchId = assertBranchAccess(req, req.query.branchId);
  const branch = await requireActiveBranch(scopedBranchId || req.query.branchId);
  const search = String(req.query.search || "").trim();
  const barcode = String(req.query.barcode || "").trim();
  const { page, limit, skip } = pageWindow(req.query);
  const threshold = branch.lowStockThreshold || LOW_STOCK_THRESHOLD;
  const whereSql = stockConditionSql(branch.id, {
    search,
    filter: req.query.filter || "",
    barcode,
    threshold,
  });
  const stockBase = Prisma.sql`s."branchId" = ${branch.id} AND NOT (s."stockCount" = 0 AND s."reservedCount" = 0 AND s.price = 0 AND m."externalApiId" IS NOT NULL)`;
  const [countRows, idRows, tallyRows] = await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "BranchStock" s JOIN "Medicine" m ON m.id = s."medicineId" WHERE ${whereSql}`,
    prisma.$queryRaw`SELECT s.id FROM "BranchStock" s JOIN "Medicine" m ON m.id = s."medicineId" WHERE ${whereSql} ORDER BY m.name ASC LIMIT ${limit} OFFSET ${skip}`,
    prisma.$queryRaw`SELECT
      COUNT(*) FILTER (WHERE (s."stockCount" - s."reservedCount") > 0 AND (s."stockCount" - s."reservedCount") < ${threshold})::int AS low,
      COUNT(*) FILTER (WHERE (s."stockCount" - s."reservedCount") <= 0)::int AS out,
      COUNT(*) FILTER (WHERE m."isPrescription" = true)::int AS rx
      FROM "BranchStock" s JOIN "Medicine" m ON m.id = s."medicineId" WHERE ${stockBase}`,
  ]);
  const ids = idRows.map((row) => row.id);
  const stocks = ids.length
    ? await prisma.branchStock.findMany({
        where: { id: { in: ids } },
        include: { medicine: { select: stockMedicineSelect } },
      })
    : [];
  const byId = new Map(stocks.map((row) => [row.id, row]));
  const rows = ids.map((id) => serializeStockRow(byId.get(id), threshold)).filter(Boolean);
  const total = Number(countRows[0]?.count || 0);

  return sendSuccess(
    res,
    {
      branch: publicBranch(branch),
      total,
      page,
      limit,
      hasMore: skip + rows.length < total,
      lowStockCount: Number(tallyRows[0]?.low || 0),
      outCount: Number(tallyRows[0]?.out || 0),
      rxCount: Number(tallyRows[0]?.rx || 0),
      stocks: rows,
    },
    "Filial ombori"
  );
});

const updateBranchStock = asyncHandler(async (req, res) => {
  const updated = await runDbTransaction(prisma, (tx) =>
    applyStockChange(tx, req, {
      stockId: req.params.id,
      nextCount: Number(req.body.stockCount),
      reason: req.body.reason,
      note: req.body.note,
    })
  );
  return sendSuccess(res, serializeStockRow(updated), "Ombor qoldig'i yangilandi");
});

const bulkUpdateStock = asyncHandler(async (req, res) => {
  const updated = await runDbTransaction(prisma, async (tx) => {
    const rows = [];
    for (const item of req.body.items) {
      rows.push(
        await applyStockChange(tx, req, {
          stockId: item.id,
          nextCount: Number(item.stockCount),
          reason: item.reason,
          note: item.note,
        })
      );
    }
    return rows;
  });
  return sendSuccess(
    res,
    { stocks: updated.map(serializeStockRow) },
    `${updated.length} ta qoldiq saqlandi`
  );
});

const listStockMovements = asyncHandler(async (req, res) => {
  const stock = await prisma.branchStock.findUnique({
    where: { id: req.params.id },
    select: { id: true, branchId: true },
  });
  if (!stock) throw new AppError("Ombor yozuvi topilmadi", 404, "NOT_FOUND");
  assertBranchAccess(req, stock.branchId);
  const movements = await prisma.stockMovement.findMany({
    where: { branchStockId: stock.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const userIds = [...new Set(movements.map((row) => row.userId).filter(Boolean))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  return sendSuccess(
    res,
    movements.map((row) => ({
      id: row.id,
      delta: row.delta,
      beforeCount: row.beforeCount,
      afterCount: row.afterCount,
      reason: row.reason,
      note: row.note,
      userName: names.get(row.userId) || "",
      createdAt: row.createdAt,
    })),
    "Ombor harakatlari"
  );
});

const syncLekko = asyncHandler(async (req, res) => {
  const requestedBranchId = req.body?.branchId || req.query.branchId;
  const scopedBranchId = assertBranchAccess(req, requestedBranchId, { write: true });
  const branch = await requireActiveBranch(scopedBranchId || requestedBranchId);

  if (!branch.lekkoApiKey || !String(branch.lekkoApiKey).trim()) {
    throw new AppError("Bu filialga LEKKO API kaliti biriktirilmagan", 400, "LEKKO_KEY_MISSING");
  }

  const fullSync = req.body?.fullSync === true || !branch.lastSyncedAt;
  const result = await syncBranchStock(branch.id, { fullSync });
  const fresh = await prisma.branch.findUnique({
    where: { id: branch.id },
    select: { lastSyncedAt: true, lekkoApiKey: true, id: true, name: true, district: true, address: true, phone: true, workingHours: true, isOpen: true },
  });
  const count = Number(result?.upserted || 0);

  return sendSuccess(
    res,
    {
      branch: publicBranch(fresh || branch),
      upserted: count,
      lastSyncedAt: fresh?.lastSyncedAt || result?.lastSyncedAt || null,
    },
    count > 0 ? `${count} ta mahsulot yangilandi` : "Yangi o'zgarish topilmadi"
  );
});

const updateDeliveryStatus = asyncHandler(async (req, res) => {
  const current = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true, branchId: true },
  });
  if (!current) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  assertBranchAccess(req, current.branchId, { write: true });

  const reason =
    req.body.status === "CANCELLED"
      ? String(req.body.reason || req.body.note || "").trim()
      : String(req.body.note || req.body.reason || "").trim();

  const result = await applyOrderStatusChange({
    orderId: req.params.id,
    requestedStatus: req.body.status,
    reason,
    user: req.user,
    req,
    orderInclude,
    serialize: (order) => serializeBranchOrder(order, req.user.id),
  });

  return sendSuccess(res, result.order, result.message);
});

const undoOrderStatus = asyncHandler(async (req, res) => {
  let previousStatus = "";
  const updated = await runDbTransaction(prisma, async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { medicine: { select: { name: true } } } },
        payment: true,
        prescription: true,
        history: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (current) previousStatus = current.status;
    if (!current) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
    assertBranchAccess(req, current.branchId, { write: true });
    const reason = undoBlockReason(current.history[0], req.user.id);
    if (reason) throw new AppError(reason, 409, "UNDO_EXPIRED");
    await undoEffects(tx, current, current.history[0], req.user.id);
    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });

  emitOrder(updated.branchId, updated);
  if (req.user.role === "SUPER_ADMIN" || req.user.role === "BRANCH_ADMIN") {
    await writeAudit(prisma, {
      req,
      action: "ORDER_STATUS",
      entityType: "Order",
      entityId: updated.id,
      branchId: updated.branchId,
      summary: `${updated.orderNumber || ""} ${previousStatus} → ${updated.status}`.trim(),
      before: { status: previousStatus },
      after: { status: updated.status, undo: true },
    });
  }
  return sendSuccess(res, serializeBranchOrder(updated, req.user.id), "Oxirgi o'zgarish qaytarildi");
});

const markCashReceived = asyncHandler(async (req, res) => {
  const updated = await runDbTransaction(prisma, async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: req.params.id },
      include: { payment: true },
    });
    if (!current) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
    assertBranchAccess(req, current.branchId, { write: true });
    if (String(current.payment?.provider || "").toUpperCase() !== "CASH") {
      throw new AppError("Bu buyurtma naqd to'lov emas", 409, "INVALID_STATUS");
    }
    if (!["PREPARING", "READY", "DELIVERING"].includes(current.status)) {
      throw new AppError("Naqd pulni yig'ish boshlangandan keyin qabul qilish mumkin", 409, "INVALID_STATUS");
    }
    if (current.payment.status === "COMPLETED") {
      return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
    }
    await tx.paymentTransaction.update({
      where: { id: current.payment.id },
      data: { status: "COMPLETED", paidAt: new Date() },
    });
    await writeAudit(tx, {
      req,
      action: "CASH_RECEIVED",
      entityType: "Order",
      entityId: current.id,
      branchId: current.branchId,
      summary: `${current.orderNumber || current.id} naqd to'lov qabul qilindi`,
      before: { paymentStatus: current.payment.status },
      after: { paymentStatus: "COMPLETED" },
    });
    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });
  emitOrder(updated.branchId, updated);
  notifyStatus(updated, "PAID");
  return sendSuccess(res, serializeBranchOrder(updated, req.user.id), "Naqd to'lov qabul qilindi");
});

const markRefund = asyncHandler(async (req, res) => {
  const updated = await runDbTransaction(prisma, async (tx) => {
    const current = await tx.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
    if (!current) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
    assertBranchAccess(req, current.branchId);
    if (req.user.role !== "SUPER_ADMIN") {
      throw new AppError("Pul qaytarishni faqat super admin belgilashi mumkin", 403, "FORBIDDEN");
    }
    if (current.refundStatus === "NOT_REQUIRED") {
      throw new AppError("Pul hali olinmagan, qaytarish shart emas", 409, "INVALID_STATUS");
    }
    if (current.refundStatus !== "PENDING") {
      throw new AppError("Pul qaytarish kutilmayapti", 409, "INVALID_STATUS");
    }
    const note = String(req.body.note || "").trim();
    const transactionId = String(req.body.transactionId || "").trim();
    const provider = String(current.payment?.provider || "").toUpperCase();
    const needsTxId = provider === "CLICK" || provider === "PAYME";
    if (note.length < 3) throw new AppError("Izoh yozing", 400, "VALIDATION_ERROR");
    if (needsTxId && transactionId.length < 3) {
      throw new AppError("Click/Payme uchun tranzaksiya ID majburiy", 400, "VALIDATION_ERROR");
    }
    if (!needsTxId && transactionId && transactionId.length < 3) {
      throw new AppError("Tranzaksiya raqamini kiriting", 400, "VALIDATION_ERROR");
    }
    const historyNote = ["Pul qaytarildi", transactionId ? `Tranzaksiya: ${transactionId}` : "", note]
      .filter(Boolean)
      .join(". ");
    await tx.order.update({
      where: { id: current.id },
      data: { refundStatus: "DONE" },
    });
    await writeHistory(tx, {
      orderId: current.id,
      fromStatus: current.status,
      toStatus: current.status,
      userId: req.user.id,
      note: historyNote,
      kind: "system",
    });
    await writeAudit(tx, {
      req,
      action: "REFUND_DONE",
      entityType: "Order",
      entityId: current.id,
      branchId: current.branchId,
      summary: `${current.orderNumber}. ${historyNote}`,
      before: { refundStatus: "PENDING" },
      after: { refundStatus: "DONE", transactionId: transactionId || null },
    });
    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });
  emitOrder(updated.branchId, updated);
  return sendSuccess(res, serializeBranchOrder(updated, req.user.id), "Pul qaytarildi");
});

const updatePharmacistNote = asyncHandler(async (req, res) => {
  const current = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true, branchId: true, pharmacistNote: true, orderNumber: true },
  });
  if (!current) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  assertBranchAccess(req, current.branchId, { write: true });
  const nextNote = String(req.body.pharmacistNote || "").trim();
  const updated = await prisma.order.update({
    where: { id: current.id },
    data: { pharmacistNote: nextNote },
    include: orderInclude,
  });
  await writeAudit(prisma, {
    req,
    action: "PHARMACIST_NOTE",
    entityType: "Order",
    entityId: current.id,
    branchId: current.branchId,
    summary: `${current.orderNumber || current.id} farmatsevt izohi yangilandi`,
    before: { pharmacistNote: current.pharmacistNote || "" },
    after: { pharmacistNote: nextNote },
  });
  return sendSuccess(res, serializeBranchOrder(updated, req.user.id), "Izoh saqlandi");
});

const getBranchOrder = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: orderInclude });
  if (!order) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  assertBranchAccess(req, order.branchId);
  const userIds = [...new Set((order.history || []).map((row) => row.userId).filter(Boolean))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  const payload = serializeBranchOrder(order, req.user.id);
  payload.history = payload.history.map((row) => ({
    ...row,
    userName: names.get(row.userId) || (row.kind === "system" ? "Tizim" : ""),
  }));
  return sendSuccess(res, payload, "Buyurtma tafsiloti");
});

const panelSummary = asyncHandler(async (req, res) => {
  const scopedBranchId = assertBranchAccess(req, req.query.branchId);
  const branch = await requireActiveBranch(scopedBranchId || req.query.branchId);
  const start = rangeStart("today");
  const [todayOrders, review, lowRows, paid] = await Promise.all([
    prisma.order.count({ where: { branchId: branch.id, createdAt: { gte: start } } }),
    prisma.order.count({ where: { branchId: branch.id, status: { in: REVIEW_STATUSES } } }),
    prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "BranchStock" WHERE "branchId" = ${branch.id} AND ("stockCount" - "reservedCount") > 0 AND ("stockCount" - "reservedCount") < ${branch.lowStockThreshold || LOW_STOCK_THRESHOLD}`,
    prisma.order.findMany({
      where: { branchId: branch.id, status: { in: PAID_LIKE }, createdAt: { gte: start } },
      select: { subtotal: true },
    }),
  ]);
  const revenue = paid.reduce((sum, order) => sum + settledTotals(order).totalAmount, 0);
  return sendSuccess(
    res,
    {
      branch: publicBranch(branch),
      todayOrders,
      revenue,
      review,
      lowStock: Number(lowRows[0]?.count || 0),
    },
    "Panel xulosasi"
  );
});

const panelStats = asyncHandler(async (req, res) => {
  const scopedBranchId = assertBranchAccess(req, req.query.branchId);
  const branch = await requireActiveBranch(scopedBranchId || req.query.branchId);
  const start = rangeStart(req.query.range || "today");
  const where = { branchId: branch.id, createdAt: { gte: start } };
  const [counts, paid, reviews, rejected] = await Promise.all([
    statusCounts(where),
    prisma.order.findMany({
      where: { ...where, status: { in: PAID_LIKE } },
      select: { subtotal: true, deliveryFee: true, discount: true, payment: { select: { provider: true, status: true, amount: true } } },
    }),
    prisma.orderStatusHistory.findMany({
      where: {
        createdAt: { gte: start },
        kind: { not: "undo" },
        fromStatus: { in: REVIEW_STATUSES },
        toStatus: { in: ["WAITING_PAYMENT", "PREPARING", "CANCELLED"] },
        order: { branchId: branch.id },
      },
      select: { createdAt: true, toStatus: true, order: { select: { createdAt: true, prescription: { select: { status: true } } } } },
    }),
    prisma.prescription.findMany({
      where: { status: "REJECTED", order: { branchId: branch.id, status: "CANCELLED", createdAt: { gte: start } } },
      select: { rejectReasons: true },
    }),
  ]);
  const approved = reviews.filter((row) => row.toStatus === "WAITING_PAYMENT" || row.toStatus === "PREPARING").length;
  const reviewMs = reviews
    .map((row) => new Date(row.createdAt).getTime() - new Date(row.order.createdAt).getTime())
    .filter((ms) => ms >= 0);
  const reasons = {};
  for (const row of rejected) {
    let codes = [];
    try {
      codes = JSON.parse(row.rejectReasons || "[]");
    } catch {
      codes = [];
    }
    if (!Array.isArray(codes) || !codes.length) codes = ["OTHER"];
    for (const code of codes) {
      const key = REJECT_LABELS[code] || code;
      reasons[key] = (reasons[key] || 0) + 1;
    }
  }
  return sendSuccess(
    res,
    {
      range: req.query.range || "today",
      orders: counts.all,
      revenue: paid.reduce((sum, order) => {
        if (unpaidCash(order.payment)) return sum;
        return sum + settledTotals(order).totalAmount;
      }, 0),
      counts,
      byStatus: {
        PENDING_PRESCRIPTION: counts.review,
        WAITING_PAYMENT: counts.WAITING_PAYMENT,
        PAID: counts.PAID,
        PREPARING: counts.PREPARING,
        READY: counts.READY,
        DELIVERING: counts.DELIVERING,
        COMPLETED: counts.COMPLETED,
        REJECTED: counts.rejected,
        CANCELLED: counts.cancelled,
      },
      approved,
      rejected: counts.rejected,
      cancelled: counts.cancelled,
      averageReviewMinutes: reviewMs.length
        ? Math.round(reviewMs.reduce((sum, ms) => sum + ms, 0) / reviewMs.length / 60000)
        : 0,
      rejectReasons: Object.entries(reasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    },
    "Statistika"
  );
});

const shiftReport = asyncHandler(async (req, res) => {
  const scopedBranchId = assertBranchAccess(req, req.query.branchId);
  const branch = await requireActiveBranch(scopedBranchId || req.query.branchId);
  const since = new Date(req.query.since);
  if (Number.isNaN(since.getTime())) {
    throw new AppError("Smena boshlanish vaqti noto'g'ri", 400, "VALIDATION_ERROR");
  }
  const [history, movements, shiftOrders] = await Promise.all([
    prisma.orderStatusHistory.findMany({
      where: { createdAt: { gte: since }, order: { branchId: branch.id } },
      include: { order: { select: { orderNumber: true, subtotal: true, status: true, refundStatus: true, payment: { select: { provider: true, status: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { createdAt: { gte: since }, branchStock: { branchId: branch.id } },
      include: { branchStock: { include: { medicine: { select: { name: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: { branchId: branch.id, createdAt: { gte: since } },
      include: { payment: true, prescription: true },
    }),
  ]);
  const userIds = [
    ...new Set([...history.map((row) => row.userId), ...movements.map((row) => row.userId)].filter(Boolean)),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  const byUser = new Map();
  function bucket(userId) {
    const key = userId || "unknown";
    if (!byUser.has(key)) {
      byUser.set(key, { userName: names.get(userId) || "Noma'lum", approved: 0, rejected: 0, completed: 0, stockChanges: 0 });
    }
    return byUser.get(key);
  }
  for (const row of history) {
    if (row.kind === "undo") continue;
    const item = bucket(row.userId);
    if ((row.toStatus === "WAITING_PAYMENT" || row.toStatus === "PREPARING") && REVIEW_STATUSES.includes(row.fromStatus)) item.approved += 1;
    if (row.toStatus === "CANCELLED" && REVIEW_STATUSES.includes(row.fromStatus)) item.rejected += 1;
    if (row.toStatus === "COMPLETED") item.completed += 1;
  }
  for (const row of movements) bucket(row.userId).stockChanges += 1;

  const statusCountsShift = {};
  let onlineRevenue = 0;
  let cashRevenue = 0;
  let refunds = 0;
  for (const order of shiftOrders) {
    statusCountsShift[order.status] = (statusCountsShift[order.status] || 0) + 1;
    if (order.prescription?.status === "REJECTED") statusCountsShift.REJECTED = (statusCountsShift.REJECTED || 0) + 1;
    if (order.refundStatus === "PENDING" || order.refundStatus === "DONE") refunds += 1;
    if (PAID_LIKE.includes(order.status)) {
      const amount = settledTotals(order).totalAmount;
      const provider = String(order.payment?.provider || "").toUpperCase();
      const cash = provider === "CASH" || provider === "CARD_TERMINAL";
      if (cash) {
        if (order.payment?.status === "COMPLETED") cashRevenue += amount;
      } else {
        onlineRevenue += amount;
      }
    }
  }

  return sendSuccess(
    res,
    {
      since: since.toISOString(),
      until: new Date().toISOString(),
      branch: publicBranch(branch),
      onlineRevenue,
      cashRevenue,
      revenue: onlineRevenue + cashRevenue,
      byStatus: statusCountsShift,
      refunds,
      stockMovements: movements.length,
      pharmacists: [...byUser.values()],
      history: history.map((row) => ({
        orderNumber: row.order.orderNumber,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        note: row.note,
        userName: names.get(row.userId) || "",
        createdAt: row.createdAt,
      })),
      movements: movements.map((row) => ({
        name: row.branchStock.medicine?.name || "",
        delta: row.delta,
        reason: row.reason,
        userName: names.get(row.userId) || "",
        createdAt: row.createdAt,
      })),
    },
    "Smena hisoboti"
  );
});

const setBranchOpen = asyncHandler(async (req, res) => {
  const scopedBranchId = assertBranchAccess(req, req.body.branchId, { write: true });
  const branch = await requireActiveBranch(scopedBranchId || req.body.branchId);
  const updated = await prisma.branch.update({
    where: { id: branch.id },
    data: { isOpen: req.body.isOpen },
  });
  publish(updated.id, { type: "branch", isOpen: updated.isOpen });
  await writeAudit(prisma, {
    req,
    action: updated.isOpen ? "BRANCH_OPEN" : "BRANCH_CLOSE",
    entityType: "Branch",
    entityId: updated.id,
    branchId: updated.id,
    summary: `${updated.name || updated.id} ${updated.isOpen ? "ochildi" : "yopildi"}`,
    before: { isOpen: branch.isOpen },
    after: { isOpen: updated.isOpen },
  });
  return sendSuccess(res, publicBranch(updated), updated.isOpen ? "Filial ochiq" : "Filial yopiq");
});

const assignCourier = asyncHandler(async (req, res) => {
  const updated = await assignOrderCourier({
    orderId: req.params.id,
    courierId: req.body.courierId,
    user: req.user,
    req,
  });
  return sendSuccess(res, serializeBranchOrder(updated, req.user.id), "Kuryer biriktirildi");
});

const streamEvents = asyncHandler(async (req, res) => {
  const scopedBranchId = assertBranchAccess(req, req.query.branchId);
  const branch = await requireActiveBranch(scopedBranchId || req.query.branchId);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ branchId: branch.id })}\n\n`);
  const stop = subscribe(branch.id, res);
  const beat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);
  req.on("close", () => {
    clearInterval(beat);
    stop();
  });
});

module.exports = {
  listBranchOrders,
  verifyPrescription,
  updateDeliveryStatus,
  undoOrderStatus,
  markCashReceived,
  markRefund,
  updatePharmacistNote,
  getBranchOrder,
  listBranchStock,
  updateBranchStock,
  bulkUpdateStock,
  listStockMovements,
  syncLekko,
  panelSummary,
  panelStats,
  shiftReport,
  setBranchOpen,
  streamEvents,
  assignCourier,
  serializeBranchOrder,
};
