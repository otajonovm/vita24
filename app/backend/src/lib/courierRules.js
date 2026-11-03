const FAIL_REASONS = ["NO_ANSWER", "ADDRESS_NOT_FOUND", "CUSTOMER_REJECTED", "OTHER"];

function providerOf(payment) {
  if (typeof payment === "string") return payment.toUpperCase();
  return String(payment?.provider || "").toUpperCase();
}

function isCollectOnDelivery(payment) {
  const provider = providerOf(payment);
  return provider === "CASH" || provider === "CARD_TERMINAL";
}

function unpaidCollectable(payment) {
  if (!payment || typeof payment === "string") return false;
  return isCollectOnDelivery(payment) && String(payment.status || "").toUpperCase() !== "COMPLETED";
}

function ownsCourierOrder(order, userId) {
  return Boolean(order && userId && order.courierId === userId && order.deliveryType !== "PICKUP");
}

function courierIsAssignable(user, branchId) {
  if (!user || user.role !== "COURIER" || user.status !== "ACTIVE" || user.deletedAt) return false;
  const links = user.courierBranches || user.branches || [];
  return links.some((row) => {
    const id = String(row.branchId || row);
    if (id !== String(branchId)) return false;
    return row.active !== false;
  });
}

function assignAllowed(order) {
  if (!order || order.deliveryType === "PICKUP") return false;
  if (order.status === "DELIVERING") return true;
  if (order.status !== "READY") return false;
  const stage = order.courierStage || "UNASSIGNED";
  return stage === "UNASSIGNED" || stage === "ASSIGNED" || stage === "FAILED";
}

function unassignAllowed(order) {
  if (!order || order.deliveryType === "PICKUP") return false;
  if (!order.courierId) return false;
  return order.status === "READY" || order.status === "DELIVERING";
}

function canPickup(order, userId) {
  if (!ownsCourierOrder(order, userId)) return { ok: false, code: "FORBIDDEN" };
  if (order.status !== "READY" || order.courierStage !== "ASSIGNED") return { ok: false, code: "INVALID_STATUS" };
  return { ok: true, status: "DELIVERING", courierStage: "PICKED_UP" };
}

function orderDueAmount(order) {
  if (order?.payment?.amount != null && order.payment.amount !== "") {
    return Math.round(Number(order.payment.amount));
  }
  if (order?.totalAmount != null && order.totalAmount !== "") {
    return Math.round(Number(order.totalAmount));
  }
  const { settledTotals } = require("./pricing");
  return Math.round(settledTotals(order).totalAmount);
}

function parseCollectedAmount(raw) {
  if (raw == null || raw === "") return null;
  const amount = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(amount) || amount < 0) return null;
  return amount;
}

function proofForDeliver(order, proof) {
  const provider = providerOf(order?.payment);
  if (isCollectOnDelivery(order?.payment)) {
    if (!proof || !proof.method) return { ok: false, code: "CASH_NOT_RECEIVED" };
    if (String(proof.method).toUpperCase() !== provider) return { ok: false, code: "VALIDATION_ERROR" };
    const amount = parseCollectedAmount(proof.collectedAmount);
    if (amount == null) return { ok: false, code: "VALIDATION_ERROR" };
    const due = orderDueAmount(order);
    const terminalRef = String(proof.terminalRef || proof.receiptNumber || "").trim().slice(0, 32) || null;
    if (provider === "CARD_TERMINAL") {
      if (amount !== due) return { ok: false, code: "AMOUNT_MISMATCH" };
      return {
        ok: true,
        method: provider,
        collectedAmount: amount,
        discrepancy: 0,
        discrepancyReason: null,
        discrepancyOpen: false,
        terminalRef,
        receiptGiven: Boolean(proof.receiptGiven),
        photoPath: proof.photoPath || null,
        markPaid: true,
      };
    }
    const discrepancy = due - amount;
    const reason = String(proof.discrepancyReason || "").trim();
    if (discrepancy !== 0 && reason.length < 3) {
      return { ok: false, code: "DISCREPANCY_REASON_REQUIRED" };
    }
    const shortfall = discrepancy > 0;
    return {
      ok: true,
      method: provider,
      collectedAmount: amount,
      discrepancy,
      discrepancyReason: discrepancy === 0 ? null : reason,
      discrepancyOpen: shortfall,
      terminalRef: null,
      receiptGiven: Boolean(proof.receiptGiven),
      photoPath: proof.photoPath || null,
      markPaid: !shortfall,
    };
  }
  if (String(order?.payment?.status || "").toUpperCase() !== "COMPLETED") {
    return { ok: false, code: "INVALID_STATUS" };
  }
  return {
    ok: true,
    method: "PREPAID",
    collectedAmount: null,
    receiptGiven: Boolean(proof?.receiptGiven),
    photoPath: proof?.photoPath || null,
    markPaid: false,
  };
}

function canDeliver(order, userId, proof) {
  if (!ownsCourierOrder(order, userId)) return { ok: false, code: "FORBIDDEN" };
  if (order.status !== "DELIVERING" || order.courierStage !== "PICKED_UP") return { ok: false, code: "INVALID_STATUS" };
  const checked = proofForDeliver(order, proof);
  if (!checked.ok) return checked;
  return { ok: true, status: "COMPLETED", courierStage: "DELIVERED", proof: checked };
}

function canFail(order, userId, reason) {
  if (!ownsCourierOrder(order, userId)) return { ok: false, code: "FORBIDDEN" };
  if (!["ASSIGNED", "PICKED_UP"].includes(order.courierStage)) return { ok: false, code: "INVALID_STATUS" };
  if (!["READY", "DELIVERING"].includes(order.status)) return { ok: false, code: "INVALID_STATUS" };
  const code = String(reason?.code || reason || "").toUpperCase();
  if (!FAIL_REASONS.includes(code)) return { ok: false, code: "VALIDATION_ERROR" };
  const note = String(reason?.note || "").trim();
  if (code === "OTHER" && note.length < 3) return { ok: false, code: "VALIDATION_ERROR" };
  return {
    ok: true,
    status: "READY",
    courierStage: "FAILED",
    deliveryFailReason: note ? `${code}: ${note}` : code,
  };
}

function handoverDifference(submitted, expected) {
  const left = Math.round((Number(submitted) || 0) * 100) / 100;
  const right = Math.round((Number(expected) || 0) * 100) / 100;
  const delta = Math.round((left - right) * 100) / 100;
  return { submitted: left, expected: right, delta, flagged: delta !== 0 };
}

function serializeCourierOrder(order) {
  const provider = providerOf(order?.payment);
  const prepaid = !isCollectOnDelivery(order?.payment);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    courierStage: order.courierStage || "UNASSIGNED",
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    deliveryLat: order.deliveryLat ?? null,
    deliveryLng: order.deliveryLng ?? null,
    items: (order.items || []).map((item) => ({
      name: item.medicine?.name || item.name || "",
      quantity: item.quantity,
    })),
    amountDue: prepaid ? 0 : Number(order?.payment?.amount || 0),
    paymentMethod: provider,
    paymentStatus: order?.payment?.status || null,
    prepaid,
    deliveryFailReason: order.deliveryFailReason || null,
    assignedAt: order.assignedAt || null,
    pickedUpAt: order.pickedUpAt || null,
    deliveredAt: order.deliveredAt || null,
  };
}

function courierScopeWhere(courierId, scope) {
  if (scope === "history") {
    return {
      courierId,
      OR: [{ courierStage: { in: ["DELIVERED", "FAILED"] } }, { status: { in: ["COMPLETED", "CANCELLED"] } }],
    };
  }
  return {
    courierId,
    courierStage: { in: ["ASSIGNED", "PICKED_UP"] },
    status: { in: ["READY", "DELIVERING"] },
  };
}

module.exports = {
  FAIL_REASONS,
  providerOf,
  isCollectOnDelivery,
  unpaidCollectable,
  ownsCourierOrder,
  courierIsAssignable,
  assignAllowed,
  unassignAllowed,
  orderDueAmount,
  canPickup,
  canDeliver,
  canFail,
  proofForDeliver,
  handoverDifference,
  serializeCourierOrder,
  courierScopeWhere,
};
