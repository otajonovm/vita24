const prisma = require("../lib/prisma");
const { AppError } = require("../lib/response");
const { verifyClickSignature, verifyPaymeAuth } = require("../lib/clickSign");
const { amountsMatch, rememberPrepare, settlePayment } = require("../lib/paymentSettlement");
const { payableAmount } = require("../lib/pricing");

function clickError(res, code, note, extra = {}) {
  return res.json({
    error: code,
    error_note: note,
    ...extra,
  });
}

async function loadPayableOrder(merchantTransId) {
  if (!merchantTransId) return null;
  return prisma.order.findUnique({
    where: { id: String(merchantTransId) },
    include: { payment: true },
  });
}

const prepare = async (req, res) => {
  const body = req.body || {};
  const sign = verifyClickSignature(body, 0);
  if (!sign.ok) {
    return clickError(res, sign.error, sign.error_note);
  }

  try {
    const order = await loadPayableOrder(body.merchant_trans_id);
    if (!order) return clickError(res, -5, "Order not found");
    if (!amountsMatch(payableAmount(order.subtotal), body.amount)) {
      return clickError(res, -2, "Incorrect amount");
    }
    if (order.status === "PAID") {
      return clickError(res, -4, "Already paid");
    }
    if (order.status !== "WAITING_PAYMENT" || order.reservedUntil < new Date()) {
      return clickError(res, -9, "Transaction cancelled");
    }

    const payment = await rememberPrepare(order.id, body.click_trans_id, "CLICK");
    return res.json({
      click_trans_id: Number(body.click_trans_id),
      merchant_trans_id: order.id,
      merchant_prepare_id: payment?.id || order.id,
      error: 0,
      error_note: "Success",
    });
  } catch (error) {
    return clickError(res, -9, error.message || "Failed");
  }
};

const complete = async (req, res) => {
  const body = req.body || {};
  const sign = verifyClickSignature(body, 1);
  if (!sign.ok) {
    return clickError(res, sign.error, sign.error_note);
  }

  try {
    const order = await loadPayableOrder(body.merchant_trans_id);
    if (!order) return clickError(res, -5, "Order not found");
    if (order.payment && body.merchant_prepare_id && order.payment.id !== String(body.merchant_prepare_id) && order.id !== String(body.merchant_prepare_id)) {
      return clickError(res, -6, "Transaction not found");
    }

    if (
      order.status === "PAID" &&
      order.payment?.externalId === String(body.click_trans_id) &&
      order.payment.provider === "CLICK"
    ) {
      return res.json({
        click_trans_id: Number(body.click_trans_id),
        merchant_trans_id: order.id,
        merchant_confirm_id: order.payment.id,
        error: 0,
        error_note: "Success",
      });
    }

    const settled = await settlePayment({
      orderId: order.id,
      provider: "CLICK",
      externalId: body.click_trans_id,
      amount: body.amount,
    });

    return res.json({
      click_trans_id: Number(body.click_trans_id),
      merchant_trans_id: order.id,
      merchant_confirm_id: settled.order.payment?.id || order.id,
      error: 0,
      error_note: "Success",
    });
  } catch (error) {
    const note = error instanceof AppError ? error.message : "Failed";
    const code = error.code === "AMOUNT_MISMATCH" ? -2 : error.code === "ALREADY_PAID" ? -4 : -9;
    return clickError(res, code, note);
  }
};

function paymeResponse(res, id, result) {
  return res.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function paymeError(res, id, code, message) {
  return res.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message: { ru: message, uz: message, en: message } },
  });
}

function paymeTime(value) {
  return new Date(value).getTime();
}

const payme = async (req, res) => {
  const header = req.headers.authorization || "";
  const body = req.body || {};
  const id = body.id;
  if (!verifyPaymeAuth(header)) {
    return paymeError(res, id, -32504, "Avtorizatsiya xatosi");
  }

  const method = body.method;
  const params = body.params || {};

  try {
    if (method === "CheckPerformTransaction") {
      const order = await loadPayableOrder(params.account?.order_id);
      if (!order || order.status !== "WAITING_PAYMENT" || order.reservedUntil < new Date()) {
        return paymeError(res, id, -31050, "Buyurtma topilmadi");
      }
      if (!amountsMatch(payableAmount(order.subtotal), params.amount / 100)) {
        return paymeError(res, id, -31001, "Summa noto'g'ri");
      }
      return paymeResponse(res, id, { allow: true });
    }

    if (method === "CreateTransaction") {
      const order = await loadPayableOrder(params.account?.order_id);
      if (!order) return paymeError(res, id, -31050, "Buyurtma topilmadi");
      if (!amountsMatch(payableAmount(order.subtotal), params.amount / 100)) {
        return paymeError(res, id, -31001, "Summa noto'g'ri");
      }

      if (order.payment?.externalId === String(params.id) && order.payment.provider === "PAYME") {
        return paymeResponse(res, id, {
          create_time: paymeTime(order.payment.updatedAt),
          transaction: String(params.id),
          state: order.payment.status === "COMPLETED" ? 2 : 1,
        });
      }

      if (order.status !== "WAITING_PAYMENT") {
        return paymeError(res, id, -31008, "Buyurtmani to'lab bo'lmaydi");
      }

      const payment = await rememberPrepare(order.id, params.id, "PAYME");
      return paymeResponse(res, id, {
        create_time: paymeTime(payment.updatedAt),
        transaction: String(params.id),
        state: 1,
      });
    }

    if (method === "PerformTransaction") {
      const payment = await prisma.paymentTransaction.findFirst({
        where: { externalId: String(params.id), provider: "PAYME" },
        include: { order: true },
      });
      if (!payment) return paymeError(res, id, -31003, "Tranzaksiya topilmadi");
      if (payment.status === "COMPLETED") {
        return paymeResponse(res, id, {
          transaction: String(params.id),
          perform_time: paymeTime(payment.paidAt || payment.updatedAt),
          state: 2,
        });
      }

      const settled = await settlePayment({
        orderId: payment.orderId,
        provider: "PAYME",
        externalId: params.id,
        amount: payableAmount(payment.order.subtotal),
      });
      return paymeResponse(res, id, {
        transaction: String(params.id),
        perform_time: paymeTime(settled.order.payment?.paidAt || new Date()),
        state: 2,
      });
    }

    if (method === "CheckTransaction") {
      const payment = await prisma.paymentTransaction.findFirst({
        where: { externalId: String(params.id), provider: "PAYME" },
      });
      if (!payment) return paymeError(res, id, -31003, "Tranzaksiya topilmadi");
      const state = payment.status === "COMPLETED" ? 2 : payment.status === "FAILED" ? -1 : 1;
      return paymeResponse(res, id, {
        create_time: paymeTime(payment.createdAt),
        perform_time: payment.paidAt ? paymeTime(payment.paidAt) : 0,
        cancel_time: 0,
        transaction: String(params.id),
        state,
        reason: null,
      });
    }

    if (method === "CancelTransaction") {
      const payment = await prisma.paymentTransaction.findFirst({
        where: { externalId: String(params.id), provider: "PAYME" },
      });
      if (!payment) return paymeError(res, id, -31003, "Tranzaksiya topilmadi");
      if (payment.status === "COMPLETED") {
        return paymeError(res, id, -31007, "To'langan tranzaksiyani bekor qilib bo'lmaydi");
      }
      if (payment.status !== "FAILED") {
        await prisma.paymentTransaction.updateMany({
          where: { id: payment.id, status: "PENDING", externalId: String(params.id) },
          data: { status: "FAILED" },
        });
      }
      return paymeResponse(res, id, {
        transaction: String(params.id),
        cancel_time: Date.now(),
        state: -1,
      });
    }

    return paymeError(res, id, -32601, "Metod topilmadi");
  } catch (error) {
    return paymeError(res, id, -32400, error.message || "Ichki xato");
  }
};

module.exports = {
  prepare,
  complete,
  payme,
};
