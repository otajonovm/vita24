const { REJECT_LABELS } = require("./panelRules");

function paymentProvider(order) {
  return String(order?.payment?.provider || "").toUpperCase();
}

function isCash(order) {
  return paymentProvider(order) === "CASH";
}

function initialCustomerStatus({ hasRx, paymentMethod }) {
  const method = String(paymentMethod || "CASH").toUpperCase();
  if (hasRx) return { status: "PENDING_PRESCRIPTION", reservation: "review", capture: false };
  if (method === "CASH") return { status: "PREPARING", reservation: "none", capture: true };
  return { status: "WAITING_PAYMENT", reservation: "payment", capture: false };
}

function rejectReasons(prescription) {
  if (!prescription || prescription.status !== "REJECTED") return [];
  let codes = [];
  try {
    const parsed = JSON.parse(prescription.rejectReasons || "[]");
    if (Array.isArray(parsed)) codes = parsed.filter((code) => typeof code === "string");
  } catch {
    codes = [];
  }
  const note = String(prescription.rejectNote || "").trim();
  if (!codes.length && note) return [{ code: "OTHER", note }];
  return codes.map((code) => ({
    code,
    note: code === "OTHER" ? note : "",
    label: REJECT_LABELS[code] || code,
  }));
}

function getCustomerOrderView(order) {
  const cash = isCash(order);
  const status = order?.status || "";
  const prescription = order?.prescription || null;
  const rejected = prescription?.status === "REJECTED";
  const cancelled = status === "CANCELLED";
  const reviewing = status === "PENDING_PRESCRIPTION" || status === "PENDING_BRANCH";

  let titleKey = "order.status.unknown";
  if (rejected) titleKey = "order.status.rxRejected";
  else if (cancelled) titleKey = "order.status.cancelled";
  else if (reviewing) titleKey = "order.status.review";
  else if (cash && status === "WAITING_PAYMENT") titleKey = "order.status.cashConfirmed";
  else if (status === "WAITING_PAYMENT") titleKey = "order.status.waitingPayment";
  else if (status === "PAID") titleKey = "order.status.paid";
  else if (status === "PREPARING") titleKey = "order.status.preparing";
  else if (status === "READY") titleKey = "order.status.ready";
  else if (status === "DELIVERING") titleKey = "order.status.delivering";
  else if (status === "COMPLETED") titleKey = "order.status.completed";

  let reservationKey = null;
  if (!rejected && !cancelled) {
    if (reviewing) reservationKey = "order.reserve.review";
    else if (status === "WAITING_PAYMENT" && !cash) reservationKey = "order.reserve.payment";
  }

  let paymentKey = null;
  if (order?.payment) {
    const provider = paymentProvider(order);
    if (cash) paymentKey = order.payment.status === "COMPLETED" ? "order.pay.cashReceived" : "order.pay.cashDue";
    else if (provider === "CLICK") paymentKey = "order.pay.click";
    else if (provider === "PAYME") paymentKey = "order.pay.payme";
    else paymentKey = "order.pay.other";
  }

  if (order?.payment && cash && order.payment.status !== "COMPLETED" && order?.deliveryType === "PICKUP") {
    paymentKey = "order.pay.cashPickup";
  }

  return {
    titleKey,
    reservationKey,
    paymentKey,
    nextStepKey: nextStepKey(order),
    customerReason: rejected ? customerRejectReason(prescription) : "",
    reasons: rejected ? rejectReasons(prescription) : [],
    cancelReason: cancelled && !rejected ? order?.notes || null : null,
    showReupload: rejected,
    showPay: status === "WAITING_PAYMENT" && !cash && !rejected,
    showPayTimer: status === "WAITING_PAYMENT" && !cash && !rejected,
    showDeliveryFee: order?.deliveryType !== "PICKUP" && Number(order?.deliveryFee) > 0,
    prescriptionKey: !prescription || rejected || cancelled ? null : reviewing ? "order.rx.pending" : null,
  };
}

function customerRejectReason(prescription) {
  return String(prescription?.rejectNote || "").trim();
}

function nextStepKey(order) {
  const status = order?.status || "";
  if (order?.prescription?.status === "REJECTED" || status === "CANCELLED" || status === "COMPLETED") return null;
  if (status === "PENDING_PRESCRIPTION" || status === "PENDING_BRANCH") return "order.next.review";
  if (status === "WAITING_PAYMENT") return isCash(order) ? "order.next.cashWait" : "order.next.pay";
  if (status === "PAID") return "order.next.paid";
  if (status === "PREPARING") return "order.next.preparing";
  if (status === "READY") return order?.deliveryType === "PICKUP" ? "order.next.readyPickup" : "order.next.readyDelivery";
  if (status === "DELIVERING") return "order.next.delivering";
  return null;
}

function showCustomerDeliveryFee(order) {
  return order?.deliveryType !== "PICKUP" && Number(order?.deliveryFee) > 0;
}

module.exports = {
  getCustomerOrderView,
  initialCustomerStatus,
  isCash,
  rejectReasons,
  nextStepKey,
  customerRejectReason,
  showCustomerDeliveryFee,
};
