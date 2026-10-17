const REVIEW = new Set(["PENDING_PRESCRIPTION", "PENDING_BRANCH"]);

function keysForTransition(from, to) {
  if (to === "CANCELLED") return ["order.timeline.cancelled"];
  const keys = [];
  if (REVIEW.has(from) && (to === "WAITING_PAYMENT" || to === "PREPARING" || to === "PAID")) {
    keys.push("order.timeline.reviewed");
  }
  if (to === "PAID") keys.push("order.timeline.paid");
  if (to === "PREPARING") keys.push("order.timeline.preparing");
  if (to === "READY") keys.push("order.timeline.ready");
  if (to === "DELIVERING") keys.push("order.timeline.onTheWay");
  if (to === "COMPLETED") keys.push("order.timeline.delivered");
  return keys;
}

const CURRENT_KEY = {
  PAID: "order.timeline.paid",
  PREPARING: "order.timeline.preparing",
  READY: "order.timeline.ready",
  DELIVERING: "order.timeline.onTheWay",
  COMPLETED: "order.timeline.delivered",
  CANCELLED: "order.timeline.cancelled",
};

export function customerTimeline(order) {
  const points = [{ id: "created", at: order?.createdAt, key: "order.timeline.received" }];
  const rows = [...(order?.history || [])]
    .filter((row) => row && row.kind !== "undo")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  rows.forEach((row) => {
    keysForTransition(row.fromStatus, row.toStatus).forEach((key, index) => {
      points.push({ id: `${row.id || row.createdAt}-${index}`, at: row.createdAt, key });
    });
  });

  const current = CURRENT_KEY[order?.status];
  if (current && !points.some((point) => point.key === current)) {
    points.push({
      id: "current",
      at: order.statusChangedAt || order.createdAt,
      key: current,
    });
  }

  return points.filter((point, index) => index === 0 || point.key !== points[index - 1].key);
}
