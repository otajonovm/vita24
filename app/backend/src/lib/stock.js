const prisma = require("./prisma");
const { AppError } = require("./response");

const RESERVATION_MS = Number(process.env.RESERVATION_MS || 10 * 1000);
const ACTIVE_STATUSES = ["PENDING_PRESCRIPTION", "PENDING_BRANCH", "WAITING_PAYMENT"];

function reservationDeadline() {
  return new Date(Date.now() + RESERVATION_MS);
}

function availableCount(stock) {
  return Math.max((stock?.stockCount || 0) - (stock?.reservedCount || 0), 0);
}

async function reserveStock(tx, { branchId, medicineId, quantity, medicineName }) {
  const updated = await tx.$executeRaw`
    UPDATE "BranchStock"
    SET "reservedCount" = "reservedCount" + ${quantity},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "branchId" = ${branchId}
      AND "medicineId" = ${medicineId}
      AND ("stockCount" - "reservedCount") >= ${quantity}
  `;

  if (updated !== 1) {
    throw new AppError(
      `${medicineName || "Dori"} uchun yetarli qoldiq yo'q`,
      409,
      "INSUFFICIENT_STOCK"
    );
  }

  return tx.branchStock.findUnique({
    where: { branchId_medicineId: { branchId, medicineId } },
  });
}

async function expireStaleReservations(client = prisma) {
  const staleOrders = await client.order.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      reservedUntil: { lt: new Date() },
    },
    include: { items: true },
  });

  let expired = 0;

  for (const order of staleOrders) {
    await client.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { in: ACTIVE_STATUSES },
          reservedUntil: { lt: new Date() },
        },
        data: { status: "CANCELLED" },
      });

      if (claimed.count !== 1) return;

      await releaseReservation(tx, order);
      await tx.paymentTransaction.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
      expired += 1;
    });
  }

  return expired;
}

async function releaseReservation(tx, order) {
  for (const item of order.items) {
    await tx.$executeRaw`
      UPDATE "BranchStock"
      SET "reservedCount" = "reservedCount" - ${item.quantity},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "branchId" = ${order.branchId}
        AND "medicineId" = ${item.medicineId}
        AND "reservedCount" >= ${item.quantity}
    `;
  }
}

async function captureStock(tx, order) {
  for (const item of order.items) {
    const updated = await tx.$executeRaw`
      UPDATE "BranchStock"
      SET "stockCount" = "stockCount" - ${item.quantity},
          "reservedCount" = "reservedCount" - ${item.quantity},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "branchId" = ${order.branchId}
        AND "medicineId" = ${item.medicineId}
        AND "stockCount" >= ${item.quantity}
        AND "reservedCount" >= ${item.quantity}
    `;

    if (updated !== 1) {
      throw new AppError(
        "To'lovni yakunlash uchun omborda yetarli qoldiq yo'q",
        409,
        "INSUFFICIENT_STOCK"
      );
    }
  }
}

module.exports = {
  RESERVATION_MS,
  ACTIVE_STATUSES,
  reservationDeadline,
  availableCount,
  reserveStock,
  expireStaleReservations,
  releaseReservation,
  captureStock,
};
