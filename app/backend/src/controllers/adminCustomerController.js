const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { runDbTransaction } = require("../lib/transaction");
const { writeAudit } = require("../lib/audit");
const { settledTotals } = require("../lib/pricing");

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseStoredAddresses(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addressLine(parts) {
  return [parts.street, parts.apartment, parts.floor, parts.intercom].filter(Boolean).join(", ");
}

const listCustomers = asyncHandler(async (_req, res) => {
  const rows = await prisma.$queryRaw`
    SELECT
      u.id,
      u.name,
      u.phone,
      u.status,
      u."createdAt" AS "createdAt",
      COUNT(o.id)::int AS "orderCount",
      COALESCE(SUM(
        CASE WHEN o.status IS DISTINCT FROM 'CANCELLED'
          THEN o.subtotal + o."deliveryFee" - o.discount
          ELSE 0
        END
      ), 0)::float8 AS "totalSpent",
      last."id" AS "lastOrderId",
      last."orderNumber" AS "lastOrderNumber",
      last.status AS "lastOrderStatus",
      last."createdAt" AS "lastOrderAt"
    FROM "User" u
    LEFT JOIN "Order" o
      ON o."userId" = u.id
      OR (o."userId" IS NULL AND o."customerPhone" = u.phone)
    LEFT JOIN LATERAL (
      SELECT o2.id, o2."orderNumber", o2.status, o2."createdAt"
      FROM "Order" o2
      WHERE o2."userId" = u.id
        OR (o2."userId" IS NULL AND o2."customerPhone" = u.phone)
      ORDER BY o2."createdAt" DESC
      LIMIT 1
    ) last ON true
    WHERE u.role = 'CUSTOMER'::"Role" AND u."deletedAt" IS NULL
    GROUP BY u.id, last.id, last."orderNumber", last.status, last."createdAt"
    ORDER BY u."createdAt" DESC
  `;

  return sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      status: row.status,
      createdAt: row.createdAt,
      orderCount: Number(row.orderCount) || 0,
      totalSpent: money(row.totalSpent),
      lastOrder: row.lastOrderId
        ? {
            id: row.lastOrderId,
            orderNumber: row.lastOrderNumber,
            status: row.lastOrderStatus,
            createdAt: row.lastOrderAt,
          }
        : null,
    })),
    "Mijozlar"
  );
});

const getCustomer = asyncHandler(async (req, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, role: "CUSTOMER", deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      blockReason: true,
      blockedAt: true,
      createdAt: true,
      lastStreet: true,
      lastApartment: true,
      lastFloor: true,
      lastIntercom: true,
      lastLat: true,
      lastLng: true,
      additionalAddresses: true,
    },
  });
  if (!user) {
    throw new AppError("Mijoz topilmadi", 404, "NOT_FOUND");
  }

  const orderWhere = {
    OR: [{ userId: user.id }, { userId: null, customerPhone: user.phone }],
  };
  const [orders, prescriptions, events] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        deliveryAddress: true,
        deliveryType: true,
        promoCode: true,
        discount: true,
        subtotal: true,
        deliveryFee: true,
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.prescription.findMany({
      where: { OR: [{ userId: user.id }, { order: orderWhere }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.customerBlockEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const addresses = [];
  if (user.lastStreet) {
    addresses.push({
      source: "primary",
      street: user.lastStreet,
      apartment: user.lastApartment || "",
      floor: user.lastFloor || "",
      intercom: user.lastIntercom || "",
      line: addressLine({
        street: user.lastStreet,
        apartment: user.lastApartment,
        floor: user.lastFloor,
        intercom: user.lastIntercom,
      }),
    });
  }
  const seen = new Set(addresses.map((item) => item.line));
  for (const entry of parseStoredAddresses(user.additionalAddresses)) {
    const street = String(entry.street || entry.lastStreet || "").trim();
    if (!street) continue;
    const line = addressLine({
      street,
      apartment: entry.apartment,
      floor: entry.floor,
      intercom: entry.intercom,
    });
    if (seen.has(line)) continue;
    seen.add(line);
    addresses.push({
      source: "saved",
      street,
      apartment: entry.apartment || "",
      floor: entry.floor || "",
      intercom: entry.intercom || "",
      line,
    });
  }
  for (const order of orders) {
    const line = String(order.deliveryAddress || "").trim();
    if (!line || order.deliveryType === "PICKUP" || seen.has(line)) continue;
    seen.add(line);
    addresses.push({ source: "order", line, orderNumber: order.orderNumber });
  }

  await writeAudit(prisma, {
    req,
    action: "CUSTOMER_VIEWED",
    entityType: "User",
    entityId: user.id,
    summary: `${user.name || ""} ${user.phone || ""}`.trim(),
    after: { phone: user.phone, name: user.name },
  });

  return sendSuccess(
    res,
    {
      id: user.id,
      name: user.name,
      phone: user.phone,
      status: user.status,
      blockReason: user.blockReason || null,
      blockedAt: user.blockedAt,
      createdAt: user.createdAt,
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        branchName: order.branch?.name || null,
        promoCode: order.promoCode || null,
        ...settledTotals(order),
      })),
      addresses,
      prescriptions: prescriptions.map((item) => ({
        id: item.id,
        fileName: item.fileName,
        status: item.status,
        createdAt: item.createdAt,
        orderId: item.order?.id || null,
        orderNumber: item.order?.orderNumber || null,
      })),
      promos: orders
        .filter((order) => order.promoCode)
        .map((order) => ({
          orderId: order.id,
          orderNumber: order.orderNumber,
          code: order.promoCode,
          discount: money(order.discount),
          createdAt: order.createdAt,
        })),
      blockEvents: events.map((event) => ({
        id: event.id,
        action: event.action,
        reason: event.reason,
        actorName: event.actorName || null,
        createdAt: event.createdAt,
      })),
    },
    "Mijoz"
  );
});

const setCustomerBlock = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  const blocking = req.body.action === "BLOCK";
  const updated = await runDbTransaction(prisma, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: req.params.id, role: "CUSTOMER", deletedAt: null },
      select: { id: true, name: true, phone: true, status: true },
    });
    if (!user) {
      throw new AppError("Mijoz topilmadi", 404, "NOT_FOUND");
    }
    if (blocking && user.status === "SUSPENDED") {
      throw new AppError("Mijoz allaqachon bloklangan", 409, "CONFLICT");
    }
    if (!blocking && user.status !== "SUSPENDED") {
      throw new AppError("Mijoz bloklanmagan", 409, "CONFLICT");
    }

    const next = await tx.user.update({
      where: { id: user.id },
      data: blocking
        ? { status: "SUSPENDED", blockReason: reason, blockedAt: new Date() }
        : { status: "ACTIVE", blockReason: null, blockedAt: null },
      select: { id: true, name: true, phone: true, status: true, blockReason: true, blockedAt: true },
    });
    await tx.customerBlockEvent.create({
      data: {
        userId: user.id,
        action: blocking ? "BLOCK" : "UNBLOCK",
        reason,
        actorId: req.user.id,
        actorName: req.user.name || null,
      },
    });
    await writeAudit(tx, {
      req,
      action: blocking ? "CUSTOMER_BLOCKED" : "CUSTOMER_UNBLOCKED",
      entityType: "User",
      entityId: user.id,
      summary: `${user.name} (${user.phone}): ${reason}`,
      before: { status: user.status },
      after: { status: next.status, reason },
    });
    return next;
  });

  return sendSuccess(res, updated, blocking ? "Mijoz bloklandi" : "Mijoz blokdan chiqarildi");
});

module.exports = {
  listCustomers,
  getCustomer,
  setCustomerBlock,
};
