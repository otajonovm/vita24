const prisma = require("./prisma");
const { AppError } = require("./response");
const { runDbTransaction } = require("./transaction");
const { payableAmount } = require("./pricing");
const { captureAsPaid, emitOrder, notifyStatus } = require("./orderFlow");

function amountsMatch(orderAmount, given) {
  const left = Math.round(Number(orderAmount) * 100);
  const right = Math.round(Number(given) * 100);
  return Number.isFinite(left) && left === right && left >= 0;
}

/**
 * Bitta tashqi tranzaksiya faqat bir marta omborni yechadi.
 * Takroriy so'rov shu externalId bilan muvaffaqiyat qaytaradi.
 */
async function settlePayment({ orderId, provider, externalId, amount }) {
  const result = await runDbTransaction(prisma, async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });

    if (!order) {
      throw new AppError("Buyurtma topilmadi", 404, "ORDER_NOT_FOUND");
    }

    if (!amountsMatch(payableAmount(order.subtotal), amount)) {
      throw new AppError("To'lov summasi mos emas", 409, "AMOUNT_MISMATCH");
    }

    const sameTransaction =
      order.payment &&
      order.payment.externalId &&
      String(order.payment.externalId) === String(externalId) &&
      order.payment.provider === provider;

    if (order.status === "PAID" && order.payment?.status === "COMPLETED") {
      if (sameTransaction || !order.payment.externalId) {
        return { order, replay: true };
      }
      throw new AppError("Buyurtma boshqa tranzaksiya bilan to'langan", 409, "ALREADY_PAID");
    }

    if (sameTransaction && order.payment.status === "COMPLETED") {
      return { order, replay: true };
    }

    if (order.status !== "WAITING_PAYMENT") {
      throw new AppError("Buyurtma to'lovni qabul qilmaydi", 409, "PAYMENT_NOT_ALLOWED");
    }

    if (order.reservedUntil < new Date()) {
      throw new AppError("Zaxira muddati tugagan", 409, "RESERVATION_EXPIRED");
    }

    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: "WAITING_PAYMENT" },
      data: { status: "PAID", statusChangedAt: new Date() },
    });

    if (claimed.count !== 1) {
      const current = await tx.order.findUnique({
        where: { id: order.id },
        include: { payment: true },
      });
      if (
        current?.status === "PAID" &&
        current.payment?.externalId === String(externalId)
      ) {
        return { order: current, replay: true };
      }
      throw new AppError("To'lov holati o'zgargan", 409, "PAYMENT_CONFLICT");
    }

    await captureAsPaid(tx, order, { kind: "system", note: "To'lov qabul qilindi" });

    if (order.payment) {
      await tx.paymentTransaction.update({
        where: { id: order.payment.id },
        data: {
          status: "COMPLETED",
          provider,
          externalId: String(externalId),
          amount: payableAmount(order.subtotal),
          paidAt: new Date(),
        },
      });
    }

    const paid = await tx.order.findUnique({
      where: { id: order.id },
      include: { payment: true, items: true },
    });
    return { order: paid, replay: false };
  });

  if (!result.replay && result.order) {
    emitOrder(result.order.branchId, result.order);
    notifyStatus(result.order, "PAID");
  }
  return result;
}

async function rememberPrepare(orderId, externalId, provider) {
  const payment = await prisma.paymentTransaction.findUnique({ where: { orderId } });
  if (!payment) return null;
  if (payment.status === "COMPLETED" && payment.externalId === String(externalId)) {
    return payment;
  }
  if (payment.status === "COMPLETED") {
    throw new AppError("Buyurtma allaqachon to'langan", 409, "ALREADY_PAID");
  }
  return prisma.paymentTransaction.update({
    where: { id: payment.id },
    data: { externalId: String(externalId), provider },
  });
}

module.exports = {
  amountsMatch,
  settlePayment,
  rememberPrepare,
};
