const prisma = require("../lib/prisma");
const { AppError } = require("../lib/response");
const { runDbTransaction } = require("../lib/transaction");
const {
  canTransition,
  describeTransition,
  unpaidCash,
  statusSuccessMessage,
} = require("../lib/orderState");
const { cancelOrder, emitOrder, notifyStatus, writeHistory } = require("../lib/orderFlow");
const { writeAudit } = require("../lib/audit");
const { reservationDeadline } = require("../lib/stock");
const { peekShopSettings } = require("../lib/shopSettings");

function reservationForNextStatus(status, checkoutRules) {
  if (status === "WAITING_PAYMENT") return reservationDeadline("payment", checkoutRules);
  return null;
}

/**
 * Buyurtma holatini o'zgartirish — yagona yo'l (validatsiya, history, notify, SSE, audit).
 * Mijoz izohi (order.notes) ustiga yozilmaydi.
 */
async function applyOrderStatusChange({
  orderId,
  requestedStatus,
  reason = "",
  user,
  req,
  orderInclude,
  serialize,
}) {
  const currentOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      branchId: true,
      userId: true,
      customerPhone: true,
      deliveryType: true,
      checkoutRules: true,
      orderNumber: true,
      payment: { select: { provider: true, status: true } },
    },
  });
  if (!currentOrder) {
    throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  }

  const note = String(reason || "").trim();
  if (
    (user.role === "CUSTOMER" || user.role === "SUPER_ADMIN") &&
    describeTransition(currentOrder.status, requestedStatus).status === "CANCELLED" &&
    note.length < 3
  ) {
    throw new AppError(
      user.role === "SUPER_ADMIN" ? "Bekor qilish sababini yozing" : "Bekor qilish sababini yozing",
      400,
      "VALIDATION_ERROR"
    );
  }

  if (
    unpaidCash(currentOrder.payment) &&
    describeTransition(currentOrder.status, requestedStatus).status === "COMPLETED"
  ) {
    throw new AppError("Naqd pul qabul qilinmaguncha buyurtmani yakunlab bo'lmaydi", 409, "CASH_NOT_RECEIVED");
  }

  if (
    !canTransition({
      from: currentOrder.status,
      to: requestedStatus,
      role: user.role,
      deliveryType: currentOrder.deliveryType,
      payment: currentOrder.payment,
    })
  ) {
    throw new AppError("Bu holatga o'tishga ruxsat yo'q", 409, "INVALID_STATUS");
  }

  const transition = describeTransition(currentOrder.status, requestedStatus);
  const nextStatus = transition.status;
  const nextReservation = reservationForNextStatus(nextStatus, currentOrder.checkoutRules);
  const settings = peekShopSettings();

  const updated = await runDbTransaction(prisma, async (tx) => {
    if (nextStatus === "CANCELLED") {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, prescription: true, payment: true },
      });
      await cancelOrder(tx, current, {
        note,
        userId: user.id,
        adminNote: user.role === "SUPER_ADMIN" ? note : undefined,
      });
      if (current.prescription && transition.rejected && user.role !== "CUSTOMER") {
        await tx.prescription.update({
          where: { id: current.prescription.id },
          data: { status: "REJECTED", rejectNote: note || null },
        });
      }
      return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
    }

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: currentOrder.status },
      data: {
        status: nextStatus,
        statusChangedAt: new Date(),
        ...(nextReservation ? { reservedUntil: nextReservation } : {}),
      },
    });

    if (claimed.count !== 1) {
      throw new AppError("Buyurtma holati o'zgargan", 409, "INVALID_STATUS");
    }

    await writeHistory(tx, {
      orderId,
      fromStatus: currentOrder.status,
      toStatus: nextStatus,
      userId: user.id,
      note: note || null,
    });

    const current = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, prescription: true, payment: true },
    });

    if (nextStatus === "WAITING_PAYMENT" && current.prescription) {
      await tx.prescription.update({
        where: { id: current.prescription.id },
        data: { status: "APPROVED", rejectNote: null },
      });
    }

    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });

  emitOrder(updated.branchId, updated);

  const cancelExtra =
    nextStatus === "CANCELLED" && note
      ? `Buyurtmangiz bekor qilindi. Sabab: ${note}`
      : undefined;
  notifyStatus(updated, nextStatus, cancelExtra);

  if (user.role === "SUPER_ADMIN" || user.role === "BRANCH_ADMIN") {
    await writeAudit(prisma, {
      req: req || { user },
      action: nextStatus === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_STATUS",
      entityType: "Order",
      entityId: updated.id,
      branchId: updated.branchId,
      summary: `${updated.orderNumber || ""} ${currentOrder.status} → ${nextStatus}${note ? `. ${note}` : ""}`.trim(),
      before: { status: currentOrder.status },
      after: { status: nextStatus, reason: note || null },
    });
  }

  void settings;
  const payload = serialize ? serialize(updated) : updated;
  return {
    order: payload,
    message: statusSuccessMessage(nextStatus),
    previousStatus: currentOrder.status,
    nextStatus,
    raw: updated,
  };
}

module.exports = {
  applyOrderStatusChange,
  reservationForNextStatus,
};
