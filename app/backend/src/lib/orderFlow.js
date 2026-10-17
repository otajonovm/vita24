const { AppError } = require("./response");
const {
  releaseReservation,
  reservationDeadline,
  reserveStock,
  restoreCapturedStock,
  recaptureSoldStock,
  captureStock,
} = require("./stock");
const { publish } = require("./panelEvents");
const { notifyCustomer } = require("./telegramBot");
const {
  REVIEW_STATUSES,
  canUndo,
  refundStatusForCancel,
  releasesReservationOnCancel,
  restoresStockOnCancel,
} = require("./panelRules");
const { releasePromo, reclaimPromo } = require("./promo");
const { peekShopSettings, renderTemplate } = require("./shopSettings");

const STATUS_TEXT = {
  PAID: "To'lovingiz qabul qilindi",
  PREPARING: "Buyurtmangiz yig'ilmoqda",
  READY: "Buyurtmangiz tayyor",
  DELIVERING: "Buyurtmangiz yo'lda",
  COMPLETED: "Buyurtmangiz yetkazildi",
  CANCELLED: "Buyurtmangiz bekor qilindi",
  WAITING_PAYMENT: "Retsept tasdiqlandi, to'lovni amalga oshiring",
};

function emitOrder(branchId, order) {
  if (!branchId || !order) return;
  publish(branchId, {
    type: "order.updated",
    orderId: order.id,
    status: order.status,
  });
}

function notifyStatus(order, status, extra) {
  const template = peekShopSettings()?.messageTemplates?.[status] || STATUS_TEXT[status];
  const text = extra || renderTemplate(template, { orderNumber: order?.orderNumber || "", status });
  if (!text || !order) return;
  const prisma = require("./prisma");
  const where = order.userId ? { id: order.userId } : order.customerPhone ? { phone: order.customerPhone } : null;
  if (!where) return;
  prisma.user
    .findFirst({ where, select: { id: true, phone: true, notifyOrders: true } })
    .then(async (user) => {
      if (!user || user.notifyOrders === false) return;
      const body = `${text}. Buyurtma: ${order.orderNumber || ""}`.trim();
      await prisma.customerNotification.create({
        data: {
          userId: user.id,
          orderId: order.id || null,
          title: text,
          body,
        },
      });
      if (user.phone || order.customerPhone) {
        await notifyCustomer(user.phone || order.customerPhone, body);
      }
    })
    .catch(() => {});
}

async function writeHistory(tx, { orderId, fromStatus, toStatus, userId, note, kind = "status" }) {
  await tx.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus,
      toStatus,
      userId: userId || null,
      note: note || null,
      kind,
    },
  });
}

async function cancelOrder(tx, order, { note, userId, adminNote } = {}) {
  const from = order.status;
  if (releasesReservationOnCancel(from)) {
    await releaseReservation(tx, order);
    if (order.payment && order.payment.status !== "COMPLETED") {
      await tx.paymentTransaction.update({
        where: { id: order.payment.id },
        data: { status: "FAILED" },
      });
    }
  } else if (restoresStockOnCancel(from)) {
    await restoreCapturedStock(tx, order);
  } else {
    throw new AppError("Bu holatdan bekor qilib bo'lmaydi", 409, "INVALID_STATUS");
  }

  const refundStatus = refundStatusForCancel(order);
  const claimed = await tx.order.updateMany({
    where: { id: order.id, status: from },
    data: {
      status: "CANCELLED",
      statusChangedAt: new Date(),
      // Mijoz izohi (notes) ustiga yozilmaydi
      ...(adminNote ? { adminNote: String(adminNote).trim() } : {}),
      ...(refundStatus ? { refundStatus } : {}),
    },
  });
  if (claimed.count !== 1) {
    throw new AppError("Buyurtma holati o'zgargan", 409, "INVALID_STATUS");
  }
  await writeHistory(tx, {
    orderId: order.id,
    fromStatus: from,
    toStatus: "CANCELLED",
    userId,
    note,
  });
  await releasePromo(tx, order);
}

function undoBlockReason(history, userId, now) {
  if (!history) return "Qaytariladigan o'zgarish yo'q";
  if (history.kind === "undo") return "Undo qilingan amalni qaytarib bo'lmaydi";
  if (!canUndo(history, userId, now)) return "Oxirgi o'zgarishni faqat 30 soniya ichida qaytarish mumkin";
  return null;
}

async function undoEffects(tx, order, last, userId) {
  const from = last.fromStatus;
  const to = last.toStatus;
  if (to === "PAID" && from === "WAITING_PAYMENT") {
    throw new AppError("To'lovni ortga qaytarib bo'lmaydi", 409, "UNDO_EXPIRED");
  }
  const rejected = order.prescription?.status === "REJECTED" && to === "CANCELLED" && REVIEW_STATUSES.includes(from);
  const approved = order.prescription?.status === "APPROVED" && REVIEW_STATUSES.includes(from) && (to === "WAITING_PAYMENT" || to === "PREPARING");

  if (rejected) {
    for (const item of order.items) {
      await reserveStock(tx, {
        branchId: order.branchId,
        medicineId: item.medicineId,
        quantity: item.quantity,
        medicineName: item.medicine?.name,
      });
    }
    await tx.prescription.update({
      where: { id: order.prescription.id },
      data: { status: "PENDING", rejectNote: null, rejectReasons: null },
    });
    if (order.payment) {
      await tx.paymentTransaction.update({
        where: { id: order.payment.id },
        data: { status: "PENDING" },
      });
    }
  } else if (approved) {
    await tx.prescription.update({
      where: { id: order.prescription.id },
      data: { status: "PENDING", rejectNote: null, rejectReasons: null },
    });
    if (to === "PREPARING") {
      await restoreCapturedStock(tx, order);
      for (const item of order.items) {
        await reserveStock(tx, {
          branchId: order.branchId,
          medicineId: item.medicineId,
          quantity: item.quantity,
          medicineName: item.medicine?.name,
        });
      }
    }
  } else if (to === "CANCELLED" && restoresStockOnCancel(from)) {
    await recaptureSoldStock(tx, order);
    await reclaimPromo(tx, order);
  } else if (to === "CANCELLED" && releasesReservationOnCancel(from)) {
    await reclaimPromo(tx, order);
    for (const item of order.items) {
      await reserveStock(tx, {
        branchId: order.branchId,
        medicineId: item.medicineId,
        quantity: item.quantity,
        medicineName: item.medicine?.name,
      });
    }
    if (order.payment && order.payment.status === "FAILED") {
      await tx.paymentTransaction.update({
        where: { id: order.payment.id },
        data: { status: "PENDING" },
      });
    }
  } else if (to === "CANCELLED") {
    await reclaimPromo(tx, order);
  }

  const data = {
    status: from,
    statusChangedAt: new Date(),
    notes: rejected || to === "CANCELLED" ? null : order.notes,
  };
  if (approved) data.reservedUntil = reservationDeadline("review", order.checkoutRules);
  if (to === "CANCELLED") data.refundStatus = "NONE";

  const claimed = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data,
  });
  if (claimed.count !== 1) throw new AppError("Buyurtma holati o'zgargan", 409, "INVALID_STATUS");
  await writeHistory(tx, {
    orderId: order.id,
    fromStatus: order.status,
    toStatus: from,
    userId,
    note: "undo",
    kind: "undo",
  });
}

async function captureAsPaid(tx, order, { userId, kind = "system", note = "To'lov qabul qilindi" } = {}) {
  await captureStock(tx, order);
  await writeHistory(tx, {
    orderId: order.id,
    fromStatus: "WAITING_PAYMENT",
    toStatus: "PAID",
    userId,
    note,
    kind,
  });
}

module.exports = {
  STATUS_TEXT,
  emitOrder,
  notifyStatus,
  writeHistory,
  cancelOrder,
  undoBlockReason,
  undoEffects,
  captureAsPaid,
};
