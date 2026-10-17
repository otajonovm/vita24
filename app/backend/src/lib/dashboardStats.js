const TZ = "Asia/Tashkent";
const MAX_RANGE_DAYS = 366;
const LOW_STOCK_THRESHOLD = 5;
const SLOW_RX_MINUTES = 30;

function pad(value) {
  return String(value).padStart(2, "0");
}

function dayKey(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function todayKey(now = new Date()) {
  return dayKey(now);
}

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function rangeStart(iso) {
  return new Date(`${iso}T00:00:00+05:00`);
}

function rangeEnd(iso) {
  return new Date(rangeStart(addDays(iso, 1)).getTime());
}

function defaultRange(now = new Date()) {
  const to = todayKey(now);
  return { from: addDays(to, -6), to };
}

function resolveRange({ from, to } = {}, now = new Date()) {
  const fallback = defaultRange(now);
  const startKey = from || fallback.from;
  const endKey = to || fallback.to;
  if (from && !to) return { error: "Tugash sanasini kiriting" };
  if (to && !from) return { error: "Boshlanish sanasini kiriting" };
  const start = rangeStart(startKey);
  const end = rangeEnd(endKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: "Sana noto'g'ri" };
  if (start >= end) return { error: "Boshlanish sanasi tugashdan oldin bo'lishi kerak" };
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days > MAX_RANGE_DAYS) return { error: "Oraliq bir yildan oshmasligi kerak" };
  return { from: startKey, to: endKey, start, end };
}

function eachDay(from, to) {
  const days = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function inRange(value, start, end) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function paidStamp(payment) {
  if (!payment || String(payment.status || "").toUpperCase() !== "COMPLETED") return null;
  return payment.paidAt || payment.updatedAt || null;
}

function isCash(provider) {
  return String(provider || "").toUpperCase() === "CASH";
}

function orderAmount(order) {
  const paid = money(order.payment?.amount);
  if (paid > 0) return paid;
  return money(Number(order.subtotal || 0) + Number(order.deliveryFee || 0) - Number(order.discount || 0));
}

function share(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 10000;
}

function average(values) {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function reviewMinutes(order) {
  const events = (order.history || [])
    .filter((row) => row.fromStatus === "PENDING_PRESCRIPTION")
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
  if (!events.length) return null;
  const started = order.prescription?.createdAt || order.createdAt;
  const minutes = (new Date(events[0].createdAt) - new Date(started)) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function deliveryMinutes(order) {
  const history = [...(order.history || [])].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
  const started = history.find((row) => row.toStatus === "DELIVERING");
  const finished = history.find((row) => row.fromStatus === "DELIVERING" && row.toStatus === "COMPLETED");
  if (!started || !finished) return null;
  const minutes = (new Date(finished.createdAt) - new Date(started.createdAt)) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function summarizeDashboard({ orders = [], branches = [], newCustomers = 0, from, to }) {
  const { start, end } = resolveRange({ from, to });
  const created = orders.filter((order) => inRange(order.createdAt, start, end));
  const paid = orders.filter((order) => inRange(paidStamp(order.payment), start, end));

  let revenueOnline = 0;
  let revenueCash = 0;
  for (const order of paid) {
    const amount = orderAmount(order);
    if (isCash(order.payment?.provider)) revenueCash += amount;
    else revenueOnline += amount;
  }
  revenueOnline = money(revenueOnline);
  revenueCash = money(revenueCash);
  const revenueTotal = money(revenueOnline + revenueCash);

  const cancelledCount = created.filter((order) => order.status === "CANCELLED").length;
  const rejectedCount = created.filter((order) => order.prescription?.status === "REJECTED").length;
  const refunds = orders.filter(
    (order) => (order.refundStatus === "PENDING" || order.refundStatus === "DONE") && inRange(order.updatedAt || order.createdAt, start, end)
  );
  const refundDone = refunds.filter((order) => order.refundStatus === "DONE");
  const refundAmount = money(refundDone.reduce((sum, order) => sum + orderAmount(order), 0));

  const days = eachDay(from, to).map((date) => ({ date, revenue: 0, revenueOnline: 0, revenueCash: 0, orders: 0 }));
  const byDay = new Map(days.map((row) => [row.date, row]));
  for (const order of created) {
    const bucket = byDay.get(dayKey(order.createdAt));
    if (bucket) bucket.orders += 1;
  }
  for (const order of paid) {
    const bucket = byDay.get(dayKey(paidStamp(order.payment)));
    if (!bucket) continue;
    const amount = orderAmount(order);
    bucket.revenue = money(bucket.revenue + amount);
    if (isCash(order.payment?.provider)) bucket.revenueCash = money(bucket.revenueCash + amount);
    else bucket.revenueOnline = money(bucket.revenueOnline + amount);
  }

  const branchRows = new Map(
    branches.map((branch) => [
      branch.id,
      {
        id: branch.id,
        name: branch.name,
        orders: 0,
        revenue: 0,
        revenueOnline: 0,
        revenueCash: 0,
        paidCount: 0,
        cancelled: 0,
        rejected: 0,
      },
    ])
  );
  function branchBucket(order) {
    const id = order.branchId || order.branch?.id;
    if (!branchRows.has(id)) {
      branchRows.set(id, {
        id,
        name: order.branch?.name || id,
        orders: 0,
        revenue: 0,
        revenueOnline: 0,
        revenueCash: 0,
        paidCount: 0,
        cancelled: 0,
        rejected: 0,
      });
    }
    return branchRows.get(id);
  }
  for (const order of created) {
    const bucket = branchBucket(order);
    bucket.orders += 1;
    if (order.status === "CANCELLED") bucket.cancelled += 1;
    if (order.prescription?.status === "REJECTED") bucket.rejected += 1;
  }
  for (const order of paid) {
    const bucket = branchBucket(order);
    const amount = orderAmount(order);
    bucket.paidCount += 1;
    bucket.revenue = money(bucket.revenue + amount);
    if (isCash(order.payment?.provider)) bucket.revenueCash = money(bucket.revenueCash + amount);
    else bucket.revenueOnline = money(bucket.revenueOnline + amount);
  }

  const medicines = new Map();
  for (const order of paid) {
    for (const item of order.items || []) {
      const key = item.medicineId || item.name;
      const current = medicines.get(key) || {
        id: key,
        name: item.medicine?.name || item.name || "—",
        quantity: 0,
        revenue: 0,
      };
      const quantity = Number(item.quantity) || 0;
      current.quantity += quantity;
      current.revenue = money(current.revenue + quantity * money(item.unitPrice));
      medicines.set(key, current);
    }
  }

  const statusCounts = new Map();
  for (const order of created) {
    statusCounts.set(order.status, (statusCounts.get(order.status) || 0) + 1);
  }

  const reviewSamples = [];
  const deliverySamples = [];
  for (const order of orders) {
    const reviewed = (order.history || []).find((row) => row.fromStatus === "PENDING_PRESCRIPTION" && inRange(row.createdAt, start, end));
    if (reviewed) {
      const minutes = reviewMinutes(order);
      if (minutes != null) reviewSamples.push(minutes);
    }
    const delivered = (order.history || []).find(
      (row) => row.fromStatus === "DELIVERING" && row.toStatus === "COMPLETED" && inRange(row.createdAt, start, end)
    );
    if (delivered) {
      const minutes = deliveryMinutes(order);
      if (minutes != null) deliverySamples.push(minutes);
    }
  }

  return {
    range: { from, to },
    summary: {
      revenueOnline,
      revenueCash,
      revenueTotal,
      orderCount: created.length,
      paidCount: paid.length,
      averageCheck: paid.length ? money(revenueTotal / paid.length) : 0,
      cancelledCount,
      cancelledShare: share(cancelledCount, created.length),
      rejectedCount,
      rejectedShare: share(rejectedCount, created.length),
      refunds: {
        count: refunds.length,
        pending: refunds.filter((order) => order.refundStatus === "PENDING").length,
        done: refundDone.length,
        amount: refundAmount,
      },
      newCustomers: Number(newCustomers) || 0,
      avgReviewMinutes: average(reviewSamples),
      avgDeliveryMinutes: average(deliverySamples),
    },
    days,
    branches: [...branchRows.values()]
      .map((row) => ({
        ...row,
        averageCheck: row.paidCount ? money(row.revenue / row.paidCount) : 0,
      }))
      .sort((left, right) => right.revenue - left.revenue || left.name.localeCompare(right.name)),
    topMedicines: [...medicines.values()].sort((left, right) => right.quantity - left.quantity || right.revenue - left.revenue).slice(0, 10),
    statuses: [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((left, right) => right.count - left.count),
  };
}

function reportRows(kind, summary, orders, range) {
  if (kind === "revenue") {
    return summary.days.map((day) => ({
      Sana: day.date,
      Online: day.revenueOnline,
      Naqd: day.revenueCash,
      Tushum: day.revenue,
      Buyurtmalar: day.orders,
    }));
  }
  if (kind === "branches") {
    return summary.branches.map((row) => ({
      Filial: row.name,
      Buyurtmalar: row.orders,
      Online: row.revenueOnline,
      Naqd: row.revenueCash,
      Tushum: row.revenue,
      OrtachaChek: row.averageCheck,
      Bekor: row.cancelled,
      Rad: row.rejected,
    }));
  }
  if (kind === "medicines") {
    return summary.topMedicines.map((row) => ({
      Dori: row.name,
      Soni: row.quantity,
      Tushum: row.revenue,
    }));
  }
  const { start, end } = resolveRange(range);
  return orders
    .filter((order) => inRange(order.createdAt, start, end))
    .map((order) => ({
      Raqam: order.orderNumber,
      Sana: dayKey(order.createdAt),
      Filial: order.branch?.name || order.branchId,
      Mijoz: order.customerName,
      Telefon: order.customerPhone,
      Holat: order.status,
      Tolov: order.payment?.provider || "",
      TolovHolati: order.payment?.status || "",
      Summa: orderAmount(order),
      Qaytarish: order.refundStatus || "NONE",
    }));
}

module.exports = {
  TZ,
  LOW_STOCK_THRESHOLD,
  SLOW_RX_MINUTES,
  dayKey,
  addDays,
  todayKey,
  resolveRange,
  defaultRange,
  summarizeDashboard,
  reportRows,
  paidStamp,
};
