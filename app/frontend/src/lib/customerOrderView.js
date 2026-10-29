const REJECT_CODES = ["NO_STAMP", "NO_SIGNATURE", "EXPIRED", "UNREADABLE", "WRONG_DRUG", "WRONG_DOSE", "OTHER"];

function providerOf(order) {
  return String(order?.payment?.provider || "").toUpperCase();
}

function isCash(order) {
  return providerOf(order) === "CASH";
}

function isPayOnDelivery(order) {
  const provider = providerOf(order);
  return provider === "CASH" || provider === "CARD_TERMINAL";
}

function courierStageKey(order) {
  if (!order || order.deliveryType === "PICKUP") return null;
  const stage = order.courierStage;
  if (!stage || stage === "UNASSIGNED") return null;
  if (stage === "FAILED") return "failed";
  if (stage === "ASSIGNED") return "assigned";
  if (stage === "PICKED_UP") return "enRoute";
  if (stage === "DELIVERED") return "delivered";
  return null;
}

function rejectReasons(prescription) {
  if (!prescription || prescription.status !== "REJECTED") return [];
  let codes = [];
  if (Array.isArray(prescription.rejectReasons)) codes = prescription.rejectReasons;
  else {
    try {
      const parsed = JSON.parse(prescription.rejectReasons || "[]");
      if (Array.isArray(parsed)) codes = parsed;
    } catch {
      codes = [];
    }
  }
  codes = codes.filter((code) => REJECT_CODES.includes(code));
  const note = String(prescription.rejectNote || "").trim();
  if (!codes.length && note) return [{ code: "OTHER", note }];
  return codes.map((code) => ({ code, note: code === "OTHER" ? note : "" }));
}

export function getCustomerOrderView(order) {
  const cash = isCash(order);
  const payOnDelivery = isPayOnDelivery(order);
  const status = order?.status || "";
  const prescription = order?.prescription || null;
  const rejected = prescription?.status === "REJECTED";
  const cancelled = status === "CANCELLED";
  const reviewing = status === "PENDING_PRESCRIPTION" || status === "PENDING_BRANCH";
  const stageKey = !rejected && !cancelled ? courierStageKey(order) : null;

  let titleKey = "order.status.unknown";
  if (rejected) titleKey = "order.status.rxRejected";
  else if (cancelled) titleKey = "order.status.cancelled";
  else if (stageKey) titleKey = `courier.stage.${stageKey}`;
  else if (reviewing) titleKey = "order.status.review";
  else if (payOnDelivery && status === "WAITING_PAYMENT") titleKey = "order.status.cashConfirmed";
  else if (status === "WAITING_PAYMENT") titleKey = "order.status.waitingPayment";
  else if (status === "PAID") titleKey = "order.status.paid";
  else if (status === "PREPARING") titleKey = "order.status.preparing";
  else if (status === "READY") titleKey = "order.status.ready";
  else if (status === "DELIVERING") titleKey = "order.status.delivering";
  else if (status === "COMPLETED") titleKey = "order.status.completed";

  let reservationKey = null;
  if (!rejected && !cancelled) {
    if (reviewing) reservationKey = "order.reserve.review";
    else if (status === "WAITING_PAYMENT" && !payOnDelivery) reservationKey = "order.reserve.payment";
  }

  let paymentKey = null;
  if (order?.payment) {
    const provider = providerOf(order);
    if (provider === "CARD_TERMINAL") {
      paymentKey = order.payment.status === "COMPLETED" ? "courier.pay.prepaid" : "courier.pay.terminalDue";
    } else if (cash) paymentKey = order.payment.status === "COMPLETED" ? "order.pay.cashReceived" : "order.pay.cashDue";
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
    nextStepKey: stageKey === "failed" ? "courier.next.failed" : stageKey === "assigned" ? "courier.next.assigned" : stageKey === "enRoute" ? "courier.next.enRoute" : nextStepKey(order),
    customerReason: rejected ? String(prescription?.customerReason || prescription?.rejectNote || "").trim() : "",
    reasons: rejected ? rejectReasons(prescription) : [],
    cancelReason: cancelled && !rejected ? order?.notes || order?.cancelReason || null : null,
    showReupload: rejected,
    showPay: status === "WAITING_PAYMENT" && !payOnDelivery && !rejected,
    showPayTimer: status === "WAITING_PAYMENT" && !payOnDelivery && !rejected,
    showDeliveryFee: order?.deliveryType !== "PICKUP" && Number(order?.deliveryFee) > 0,
    prescriptionKey: !prescription || rejected || cancelled ? null : reviewing ? "order.rx.pending" : null,
  };
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

export const CUSTOMER_CANCEL_STATUSES = ["PENDING_PRESCRIPTION", "PENDING_BRANCH", "WAITING_PAYMENT", "PAID"];

export function customerCanCancel(status) {
  return CUSTOMER_CANCEL_STATUSES.includes(status);
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);

export function isTerminalOrder(order) {
  if (!order) return false;
  if (TERMINAL_STATUSES.has(order.status)) return true;
  return order.prescription?.status === "REJECTED";
}
