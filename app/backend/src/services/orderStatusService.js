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
const { proofForDeliver } = require("../lib/courierRules");
const { publish } = require("../lib/panelEvents");

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
  proof,
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
      courierId: true,
      courierStage: true,
      payment: { select: { id: true, provider: true, status: true, amount: true } },
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

  if (user.role === "COURIER") {
    if (currentOrder.deliveryType === "PICKUP" || currentOrder.courierId !== user.id) {
      throw new AppError("Bu buyurtma sizga biriktirilmagan", 403, "FORBIDDEN");
    }
  }

  const completing = describeTransition(currentOrder.status, requestedStatus).status === "COMPLETED";
  let settledProof = null;
  if (user.role === "COURIER" && completing) {
    const checked = proofForDeliver(currentOrder, proof);
    if (!checked.ok) {
      throw new AppError(
        checked.code === "CASH_NOT_RECEIVED"
          ? "To'lov tasdig'isiz buyurtmani yakunlab bo'lmaydi"
          : "To'lov tasdig'i noto'g'ri",
        checked.code === "CASH_NOT_RECEIVED" ? 409 : 400,
        checked.code
      );
    }
    settledProof = checked;
  } else if (unpaidCash(currentOrder.payment) && completing) {
    throw new AppError("Naqd pul qabul qilinmaguncha buyurtmani yakunlab bo'lmaydi", 409, "CASH_NOT_RECEIVED");
  }

  if (user.role === "COURIER" && requestedStatus === "DELIVERING") {
    if (currentOrder.status !== "READY" || currentOrder.courierStage !== "ASSIGNED") {
      throw new AppError("Buyurtmani olish uchun avval biriktirilgan bo'lishi kerak", 409, "INVALID_STATUS");
    }
  }

  if (
    !canTransition({
      from: currentOrder.status,
      to: requestedStatus,
      role: user.role,
      deliveryType: currentOrder.deliveryType,
      payment: currentOrder.payment,
      userId: user.id,
      courierId: currentOrder.courierId,
      collected: Boolean(settledProof?.markPaid) || Boolean(settledProof && !unpaidCash(currentOrder.payment)),
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

    if (user.role === "COURIER" && nextStatus === "DELIVERING") {
      await tx.order.update({
        where: { id: orderId },
        data: { courierStage: "PICKED_UP", pickedUpAt: new Date() },
      });
    }
    if (user.role === "COURIER" && nextStatus === "COMPLETED") {
      await tx.order.update({
        where: { id: orderId },
        data: { courierStage: "DELIVERED", deliveredAt: new Date() },
      });
    }
    if (settledProof && user.role === "COURIER") {
      await tx.deliveryProof.create({
        data: {
          orderId,
          courierId: user.id,
          method: settledProof.method,
          collectedAmount: settledProof.collectedAmount,
          receiptGiven: Boolean(settledProof.receiptGiven),
          photoPath: settledProof.photoPath || null,
        },
      });
      if (settledProof.markPaid && currentOrder.payment?.id) {
        await tx.paymentTransaction.update({
          where: { id: currentOrder.payment.id },
          data: { status: "COMPLETED", paidAt: new Date() },
        });
      }
    }
    if (user.role === "COURIER") {
      await writeAudit(tx, {
        req: req || { user },
        action: "ORDER_STATUS",
        entityType: "Order",
        entityId: orderId,
        branchId: currentOrder.branchId,
        summary: `${currentOrder.orderNumber || ""} ${currentOrder.status} → ${nextStatus}`.trim(),
        before: { status: currentOrder.status, courierStage: currentOrder.courierStage },
        after: { status: nextStatus, proof: settledProof?.method || null },
      });
    }

    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });

  emitOrder(updated.branchId, updated);
  if (user.role === "COURIER") {
    publish(`courier:${user.id}`, { type: "order.updated", orderId: updated.id, status: updated.status });
  }

  const cancelExtra =
    nextStatus === "CANCELLED" && note
      ? `Buyurtmangiz bekor qilindi. Sabab: ${note}`
      : undefined;
  const notifyKey =
    user.role === "COURIER" && nextStatus === "DELIVERING"
      ? "COURIER_PICKED_UP"
      : user.role === "COURIER" && nextStatus === "COMPLETED"
        ? "COURIER_DELIVERED"
        : nextStatus;
  notifyStatus(updated, notifyKey, cancelExtra);

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
