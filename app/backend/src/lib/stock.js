const prisma = require("./prisma");
const { AppError } = require("./response");
const { runDbTransaction } = require("./transaction");
const { releasePromo } = require("./promo");

const { windowMinutes } = require("./shopSettings");

const PAYMENT_WINDOW_MS = 15 * 60 * 1000;
const REVIEW_WINDOW_MS = 2 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ["PENDING_PRESCRIPTION", "PENDING_BRANCH", "WAITING_PAYMENT"];

function reservationDeadline(kind = "payment", rules) {
  return new Date(Date.now() + windowMinutes(kind, rules) * 60 * 1000);
}

function reservationForNextStatus(status, rules) {
  if (status === "WAITING_PAYMENT") return reservationDeadline("payment", rules);
  return null;
}

const LOW_STOCK = 5;

function availableCount(stock) {
  return Math.max((stock?.stockCount || 0) - (stock?.reservedCount || 0), 0);
}

function exceedsAvailable(quantity, available) {
  const want = Math.floor(Number(quantity) || 0);
  const left = Math.max(0, Math.floor(Number(available) || 0));
  return want > left;
}

function stockLevel(available) {
  const left = Math.max(0, Math.floor(Number(available) || 0));
  if (left <= 0) return "out";
  if (left <= LOW_STOCK) return "low";
  return "in";
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

  if (Number(updated) !== 1) {
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
  const staleIds = await client.$queryRaw`
    SELECT id, "branchId"
    FROM "Order"
    WHERE status IN ('PENDING_PRESCRIPTION', 'PENDING_BRANCH', 'WAITING_PAYMENT')
      AND "reservedUntil" < CURRENT_TIMESTAMP
  `;

  let expired = 0;

  for (const row of staleIds) {
    const didExpire = await runDbTransaction(client, async (tx) => {
      const locked = await tx.$queryRaw`
        SELECT id, status, "branchId", "userId", "customerPhone", "orderNumber", "promoCode"
        FROM "Order"
        WHERE id = ${row.id}
          AND status IN ('PENDING_PRESCRIPTION', 'PENDING_BRANCH', 'WAITING_PAYMENT')
          AND "reservedUntil" < CURRENT_TIMESTAMP
        FOR UPDATE
      `;

      if (!locked.length) return false;

      const items = await tx.orderItem.findMany({
        where: { orderId: row.id },
        select: { medicineId: true, quantity: true },
      });

      const claimed = await tx.order.updateMany({
        where: {
          id: row.id,
          status: { in: ACTIVE_STATUSES },
          reservedUntil: { lt: new Date() },
        },
        data: { status: "CANCELLED" },
      });

      if (claimed.count !== 1) return false;

      await tx.orderStatusHistory.create({
        data: {
          orderId: row.id,
          fromStatus: locked[0].status,
          toStatus: "CANCELLED",
          note: "Muddat tugadi",
          kind: "system",
        },
      });

      await releaseReservation(tx, {
        branchId: locked[0].branchId,
        items,
      });
      await releasePromo(tx, { id: row.id, promoCode: locked[0].promoCode });
      await tx.paymentTransaction.updateMany({
        where: { orderId: row.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
      return {
        id: locked[0].id,
        userId: locked[0].userId || null,
        phone: locked[0].customerPhone || "",
        number: locked[0].orderNumber || "",
      };
    });

    if (didExpire) {
      expired += 1;
      require("./panelEvents").publish(row.branchId, {
        type: "order.updated",
        orderId: row.id,
        status: "CANCELLED",
      });
      require("./orderFlow").notifyStatus(
        {
          id: didExpire.id,
          userId: didExpire.userId,
          customerPhone: didExpire.phone,
          orderNumber: didExpire.number,
        },
        "CANCELLED",
        "Buyurtmangiz bekor qilindi. Sabab: Muddat tugadi"
      );
    }
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

async function restoreCapturedStock(tx, order) {
  for (const item of order.items) {
    await tx.$executeRaw`
      UPDATE "BranchStock"
      SET "stockCount" = "stockCount" + ${item.quantity},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "branchId" = ${order.branchId}
        AND "medicineId" = ${item.medicineId}
    `;
  }
}

async function recaptureSoldStock(tx, order) {
  for (const item of order.items) {
    const updated = await tx.$executeRaw`
      UPDATE "BranchStock"
      SET "stockCount" = "stockCount" - ${item.quantity},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "branchId" = ${order.branchId}
        AND "medicineId" = ${item.medicineId}
        AND "stockCount" >= ${item.quantity}
    `;

    if (Number(updated) !== 1) {
      throw new AppError(
        "Ortga qaytarish uchun omborda yetarli qoldiq yo'q",
        409,
        "INSUFFICIENT_STOCK"
      );
    }
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

    if (Number(updated) !== 1) {
      throw new AppError(
        "To'lovni yakunlash uchun omborda yetarli qoldiq yo'q",
        409,
        "INSUFFICIENT_STOCK"
      );
    }
  }
}

module.exports = {
  PAYMENT_WINDOW_MS,
  REVIEW_WINDOW_MS,
  ACTIVE_STATUSES,
  reservationDeadline,
  reservationForNextStatus,
  LOW_STOCK,
  availableCount,
  exceedsAvailable,
  stockLevel,
  reserveStock,
  expireStaleReservations,
  releaseReservation,
  restoreCapturedStock,
  recaptureSoldStock,
  captureStock,
};
