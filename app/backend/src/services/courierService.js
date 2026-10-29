const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { AppError } = require("../lib/response");
const { runDbTransaction } = require("../lib/transaction");
const { writeAudit } = require("../lib/audit");
const { emitOrder, notifyStatus, writeHistory } = require("../lib/orderFlow");
const { publish } = require("../lib/panelEvents");
const { normalizePhone } = require("../lib/userProvisioning");
const { applyOrderStatusChange } = require("./orderStatusService");
const { notifyCustomer } = require("../bot/services");
const {
  assignAllowed,
  canFail,
  canPickup,
  courierIsAssignable,
  courierScopeWhere,
  handoverDifference,
  serializeCourierOrder,
} = require("../lib/courierRules");

const courierOrderInclude = {
  items: { include: { medicine: { select: { name: true } } } },
  payment: true,
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function emitCourier(courierId, order) {
  if (!courierId || !order) return;
  publish(`courier:${courierId}`, {
    type: "order.updated",
    orderId: order.id,
    status: order.status,
  });
}

async function loadOwned(orderId, userId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: courierOrderInclude,
  });
  if (!order) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  if (order.courierId !== userId || order.deliveryType === "PICKUP") {
    throw new AppError("Bu buyurtma sizga biriktirilmagan", 403, "FORBIDDEN");
  }
  return order;
}

async function listCourierOrders(courierId, scope) {
  const orders = await prisma.order.findMany({
    where: courierScopeWhere(courierId, scope === "history" ? "history" : "active"),
    include: courierOrderInclude,
    orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
  });
  return orders.map(serializeCourierOrder);
}

async function pickupOrder({ orderId, user, req }) {
  const order = await loadOwned(orderId, user.id);
  const decision = canPickup(order, user.id);
  if (!decision.ok) throw new AppError("Buyurtmani hozir olib bo'lmaydi", 409, decision.code);
  const result = await applyOrderStatusChange({
    orderId,
    requestedStatus: "DELIVERING",
    user,
    req,
    orderInclude: courierOrderInclude,
  });
  return serializeCourierOrder(result.raw);
}

async function deliverOrder({ orderId, user, req, proof }) {
  const order = await loadOwned(orderId, user.id);
  const decision = require("../lib/courierRules").canDeliver(order, user.id, proof);
  if (!decision.ok) {
    const message =
      decision.code === "CASH_NOT_RECEIVED"
        ? "To'lov tasdig'isiz buyurtmani yakunlab bo'lmaydi"
        : decision.code === "FORBIDDEN"
          ? "Bu buyurtma sizga biriktirilmagan"
          : "Buyurtmani hozir yakunlab bo'lmaydi";
    throw new AppError(message, decision.code === "FORBIDDEN" ? 403 : 409, decision.code);
  }
  const result = await applyOrderStatusChange({
    orderId,
    requestedStatus: "COMPLETED",
    user,
    req,
    proof: decision.proof,
    orderInclude: courierOrderInclude,
  });
  return serializeCourierOrder(result.raw);
}

async function failOrder({ orderId, user, req, reason }) {
  const order = await loadOwned(orderId, user.id);
  const decision = canFail(order, user.id, reason);
  if (!decision.ok) {
    throw new AppError(
      decision.code === "FORBIDDEN" ? "Bu buyurtma sizga biriktirilmagan" : "Buyurtmani bu holatda yopib bo'lmaydi",
      decision.code === "VALIDATION_ERROR" ? 400 : decision.code === "FORBIDDEN" ? 403 : 409,
      decision.code
    );
  }
  const updated = await runDbTransaction(prisma, async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: order.status, courierId: user.id },
      data: {
        status: "READY",
        courierStage: "FAILED",
        deliveryFailReason: decision.deliveryFailReason,
        statusChangedAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new AppError("Buyurtma holati o'zgargan", 409, "INVALID_STATUS");
    await writeHistory(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "READY",
      userId: user.id,
      note: decision.deliveryFailReason,
    });
    await writeAudit(tx, {
      req,
      action: "ORDER_STATUS",
      entityType: "Order",
      entityId: order.id,
      branchId: order.branchId,
      summary: `${order.orderNumber || ""} yetkazib bo'lmadi. ${decision.deliveryFailReason}`,
      before: { status: order.status, courierStage: order.courierStage },
      after: { status: "READY", courierStage: "FAILED", reason: decision.deliveryFailReason },
    });
    return tx.order.findUnique({ where: { id: order.id }, include: courierOrderInclude });
  });
  emitOrder(updated.branchId, updated);
  emitCourier(user.id, updated);
  notifyStatus(updated, "COURIER_FAILED");
  return serializeCourierOrder(updated);
}

async function lockedOrderIds(courierId, statuses) {
  const rows = await prisma.cashHandover.findMany({
    where: { courierId, status: { in: statuses } },
    select: { orderIds: true },
  });
  return new Set(rows.flatMap((row) => row.orderIds || []));
}

function cashProofSum(proofs) {
  return money(
    (proofs || [])
      .filter((row) => row.method === "CASH")
      .reduce((sum, row) => sum + Number(row.collectedAmount || 0), 0)
  );
}

async function shiftSummary(courierId) {
  const start = startOfToday();
  const [deliveredToday, proofs, pendingOrConfirmed, confirmedOnly] = await Promise.all([
    prisma.order.count({
      where: { courierId, courierStage: "DELIVERED", deliveredAt: { gte: start } },
    }),
    prisma.deliveryProof.findMany({
      where: { courierId },
      select: { orderId: true, method: true, collectedAmount: true, createdAt: true },
    }),
    lockedOrderIds(courierId, ["PENDING", "CONFIRMED"]),
    lockedOrderIds(courierId, ["CONFIRMED"]),
  ]);
  let cashOnHand = 0;
  let cardCollected = 0;
  let unhanded = 0;
  const unhandedOrderIds = [];
  for (const proof of proofs) {
    const amount = Number(proof.collectedAmount || 0);
    if (proof.method === "CARD_TERMINAL" && proof.createdAt >= start) cardCollected += amount;
    if (proof.method !== "CASH") continue;
    if (!confirmedOnly.has(proof.orderId)) cashOnHand += amount;
    if (!pendingOrConfirmed.has(proof.orderId)) {
      unhanded += amount;
      if (!unhandedOrderIds.includes(proof.orderId)) unhandedOrderIds.push(proof.orderId);
    }
  }
  return {
    deliveredToday,
    cashOnHand: money(cashOnHand),
    cardCollected: money(cardCollected),
    unhanded: money(unhanded),
    unhandedOrderIds,
  };
}

async function createHandover({ courierId, orderIds, amount }) {
  const ids = [...new Set((orderIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) throw new AppError("Buyurtmalarni tanlang", 400, "VALIDATION_ERROR");
  const submitted = Number(amount);
  if (!Number.isFinite(submitted) || submitted < 0) {
    throw new AppError("Summani kiriting", 400, "VALIDATION_ERROR");
  }
  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: { payment: true, deliveryProofs: true },
  });
  if (orders.length !== ids.length || orders.some((order) => order.courierId !== courierId)) {
    throw new AppError("Faqat o'z naqd buyurtmalaringizni topshira olasiz", 403, "FORBIDDEN");
  }
  const branchIds = new Set(orders.map((order) => order.branchId));
  if (branchIds.size !== 1) throw new AppError("Topshirish bitta filial bo'yicha bo'lsin", 400, "VALIDATION_ERROR");
  for (const order of orders) {
    if (String(order.payment?.provider || "").toUpperCase() !== "CASH") {
      throw new AppError("Faqat naqd buyurtmalar topshiriladi", 409, "INVALID_STATUS");
    }
    if (!order.deliveryProofs.some((row) => row.method === "CASH")) {
      throw new AppError("Tasdiqlanmagan naqd buyurtma topshirilmaydi", 409, "CASH_NOT_RECEIVED");
    }
  }
  const locked = await lockedOrderIds(courierId, ["PENDING", "CONFIRMED"]);
  if (ids.some((id) => locked.has(id))) {
    throw new AppError("Bu buyurtmalar allaqachon topshirilgan", 409, "INVALID_STATUS");
  }
  const expected = money(orders.reduce((sum, order) => sum + cashProofSum(order.deliveryProofs), 0));
  const created = await prisma.cashHandover.create({
    data: {
      courierId,
      branchId: orders[0].branchId,
      amount: money(submitted),
      orderIds: ids,
      status: "PENDING",
    },
  });
  return { ...created, amount: money(created.amount), ...handoverDifference(created.amount, expected) };
}

function assertPassword(password) {
  const value = String(password || "");
  if (value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new AppError("Parol kamida 8 belgi, harf va raqam bilan bo'lishi kerak", 400, "VALIDATION_ERROR");
  }
}

function publicCourier(user, stats) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    status: user.status,
    active: user.status === "ACTIVE",
    todayDelivered: stats?.delivered || 0,
    todayCash: stats?.cash || 0,
  };
}

async function listBranchCouriers(branchId) {
  const links = await prisma.courierBranch.findMany({
    where: { branchId },
    include: { courier: { select: { id: true, name: true, phone: true, status: true, role: true, deletedAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  const couriers = links.map((row) => row.courier).filter((user) => user && user.role === "COURIER" && !user.deletedAt);
  const ids = couriers.map((user) => user.id);
  const start = startOfToday();
  const delivered = ids.length
    ? await prisma.order.findMany({
        where: { branchId, courierId: { in: ids }, courierStage: "DELIVERED", deliveredAt: { gte: start } },
        select: { courierId: true, payment: { select: { provider: true, amount: true, status: true } } },
      })
    : [];
  const stats = new Map();
  for (const order of delivered) {
    const bucket = stats.get(order.courierId) || { delivered: 0, cash: 0 };
    bucket.delivered += 1;
    if (String(order.payment?.provider || "").toUpperCase() === "CASH" && order.payment.status === "COMPLETED") {
      bucket.cash += Number(order.payment.amount || 0);
    }
    stats.set(order.courierId, bucket);
  }
  return couriers.map((user) => {
    const bucket = stats.get(user.id) || { delivered: 0, cash: 0 };
    return publicCourier(user, { delivered: bucket.delivered, cash: money(bucket.cash) });
  });
}

async function createCourier({ branchId, body, req }) {
  const name = String(body.name || "").trim();
  if (name.length < 2) throw new AppError("Ismni kiriting", 400, "VALIDATION_ERROR");
  assertPassword(body.password);
  const phone = normalizePhone(body.phone);
  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (existing) throw new AppError("Bu telefon band", 409, "CONFLICT");
  const passwordHash = await bcrypt.hash(String(body.password), 10);
  const user = await prisma.user.create({
    data: {
      name,
      phone,
      passwordHash,
      role: "COURIER",
      status: "ACTIVE",
      courierBranches: { create: [{ branchId }] },
    },
  });
  await writeAudit(prisma, {
    req,
    action: "COURIER_CREATED",
    entityType: "User",
    entityId: user.id,
    branchId,
    summary: `${name} ${phone}`,
    after: { role: "COURIER", status: "ACTIVE", branchId },
  });
  return publicCourier(user, { delivered: 0, cash: 0 });
}

async function updateCourier({ branchId, courierId, body, req }) {
  const link = await prisma.courierBranch.findUnique({
    where: { courierId_branchId: { courierId, branchId } },
    include: { courier: true },
  });
  if (!link || link.courier.role !== "COURIER" || link.courier.deletedAt) {
    throw new AppError("Kuryer topilmadi", 404, "NOT_FOUND");
  }
  const data = {};
  if (body.name != null) {
    const name = String(body.name).trim();
    if (name.length < 2) throw new AppError("Ismni kiriting", 400, "VALIDATION_ERROR");
    data.name = name;
  }
  if (body.status != null) {
    if (body.status !== "ACTIVE" && body.status !== "SUSPENDED") {
      throw new AppError("Holat noto'g'ri", 400, "VALIDATION_ERROR");
    }
    data.status = body.status;
  }
  if (!Object.keys(data).length) throw new AppError("O'zgarish yo'q", 400, "VALIDATION_ERROR");
  const user = await prisma.user.update({ where: { id: courierId }, data });
  await writeAudit(prisma, {
    req,
    action: "COURIER_UPDATED",
    entityType: "User",
    entityId: user.id,
    branchId,
    summary: `${user.name} ${user.status}`,
    before: { status: link.courier.status, name: link.courier.name },
    after: { status: user.status, name: user.name },
  });
  return publicCourier(user);
}

async function assignOrderCourier({ orderId, courierId, user, req }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  if (order.branchId !== user.branchId) throw new AppError("Boshqa filial ma'lumotlariga ruxsat yo'q", 403, "FORBIDDEN");
  if (!assignAllowed(order)) {
    throw new AppError("Kuryerni faqat tayyor, biriktirilgan yoki yetkazilmagan buyurtmaga qo'yish mumkin", 409, "INVALID_STATUS");
  }
  const courier = await prisma.user.findUnique({
    where: { id: String(courierId || "") },
    include: { courierBranches: true },
  });
  if (!courierIsAssignable(courier, order.branchId)) {
    throw new AppError("Faol kuryer shu filialda yo'q", 409, "INVALID_STATUS");
  }
  const previousCourierId = order.courierId;
  const updated = await runDbTransaction(prisma, async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        courierId: courier.id,
        courierStage: "ASSIGNED",
        assignedAt: new Date(),
        deliveryFailReason: null,
        pickedUpAt: null,
      },
    });
    await writeHistory(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: order.status,
      userId: user.id,
      note: `courier:${courier.id}`,
    });
    await writeAudit(tx, {
      req,
      action: "COURIER_ASSIGNED",
      entityType: "Order",
      entityId: order.id,
      branchId: order.branchId,
      summary: `${order.orderNumber || ""} → ${courier.name}`,
      before: { courierId: previousCourierId, courierStage: order.courierStage },
      after: { courierId: courier.id, courierStage: "ASSIGNED" },
    });
    return tx.order.findUnique({
      where: { id: order.id },
      include: {
        ...courierOrderInclude,
        courier: { select: { id: true, name: true, phone: true, status: true } },
        branch: { select: { id: true, name: true, district: true, address: true, phone: true, workingHours: true, isOpen: true } },
        prescription: true,
        user: { select: { id: true, name: true, phone: true, role: true } },
        history: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    });
  });
  emitOrder(updated.branchId, updated);
  emitCourier(courier.id, updated);
  if (previousCourierId && previousCourierId !== courier.id) emitCourier(previousCourierId, updated);
  notifyStatus(updated, "COURIER_ASSIGNED");
  const text = `Yangi buyurtma ${updated.orderNumber || ""}. ${updated.deliveryAddress || ""}`.trim();
  notifyCustomer(courier.phone, text).catch(() => {});
  return updated;
}

async function expectedCash(handover) {
  const proofs = await prisma.deliveryProof.findMany({
    where: { courierId: handover.courierId, orderId: { in: handover.orderIds || [] }, method: "CASH" },
  });
  return cashProofSum(proofs);
}

function serializeHandover(row, expected, orders) {
  const diff = handoverDifference(row.amount, expected);
  return {
    id: row.id,
    courierId: row.courierId,
    courierName: row.courier?.name || "",
    branchId: row.branchId,
    amount: money(row.amount),
    orderIds: row.orderIds || [],
    orders: (orders || []).map((order) => ({ id: order.id, orderNumber: order.orderNumber })),
    status: row.status,
    confirmedAt: row.confirmedAt,
    note: row.note || "",
    expectedAmount: diff.expected,
    difference: diff.delta,
    differenceFlagged: diff.flagged,
    createdAt: row.createdAt,
  };
}

async function listHandovers(branchId) {
  const rows = await prisma.cashHandover.findMany({
    where: { branchId },
    include: { courier: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const ids = [...new Set(rows.flatMap((row) => row.orderIds || []))];
  const orders = ids.length
    ? await prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true, orderNumber: true } })
    : [];
  const byId = new Map(orders.map((order) => [order.id, order]));
  const result = [];
  for (const row of rows) {
    const expected = await expectedCash(row);
    result.push(serializeHandover(row, expected, (row.orderIds || []).map((id) => byId.get(id)).filter(Boolean)));
  }
  return result;
}

async function settleHandover({ id, branchId, user, req, mode, note }) {
  const handover = await prisma.cashHandover.findUnique({ where: { id }, include: { courier: { select: { name: true } } } });
  if (!handover || handover.branchId !== branchId) throw new AppError("Topshirish topilmadi", 404, "NOT_FOUND");
  if (handover.status !== "PENDING") throw new AppError("Bu so'rov allaqachon yopilgan", 409, "INVALID_STATUS");
  const expected = await expectedCash(handover);
  const diff = handoverDifference(handover.amount, expected);
  const text = String(note || "").trim();
  let status = "CONFIRMED";
  let nextNote = handover.note;
  if (mode === "dispute") {
    if (text.length < 3) throw new AppError("E'tiroz sababini yozing", 400, "VALIDATION_ERROR");
    status = "DISPUTED";
    nextNote = text;
  } else if (diff.flagged) {
    status = "DISPUTED";
    nextNote = [`Summa farqi: ${diff.delta}`, text].filter(Boolean).join(". ");
  }
  const updated = await prisma.cashHandover.update({
    where: { id: handover.id },
    data: {
      status,
      note: nextNote,
      confirmedById: user.id,
      confirmedAt: new Date(),
    },
    include: { courier: { select: { name: true } } },
  });
  await writeAudit(prisma, {
    req,
    action: status === "CONFIRMED" ? "HANDOVER_CONFIRMED" : "HANDOVER_DISPUTED",
    entityType: "CashHandover",
    entityId: handover.id,
    branchId,
    summary: `${handover.courier?.name || ""} ${money(handover.amount)} ${status}${diff.flagged ? ` farq ${diff.delta}` : ""}`,
    before: { status: "PENDING", amount: money(handover.amount) },
    after: { status, expected: diff.expected, difference: diff.delta, flagged: diff.flagged },
  });
  return serializeHandover(updated, expected, []);
}

module.exports = {
  listCourierOrders,
  pickupOrder,
  deliverOrder,
  failOrder,
  shiftSummary,
  createHandover,
  listBranchCouriers,
  createCourier,
  updateCourier,
  assignOrderCourier,
  listHandovers,
  settleHandover,
};
