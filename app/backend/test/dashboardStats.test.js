const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeDashboard, resolveRange, reportRows, dayKey } = require("../src/lib/dashboardStats");
const { toCsv } = require("../src/lib/reportFile");

function order(partial) {
  return {
    id: partial.id,
    orderNumber: partial.orderNumber,
    branchId: partial.branchId,
    branch: { id: partial.branchId, name: partial.branchName },
    status: partial.status || "PAID",
    customerName: "Mijoz",
    customerPhone: "+998900000000",
    subtotal: partial.subtotal || 10000,
    deliveryFee: 0,
    discount: 0,
    refundStatus: partial.refundStatus || "NONE",
    createdAt: partial.createdAt,
    updatedAt: partial.updatedAt || partial.createdAt,
    payment: partial.payment || null,
    prescription: partial.prescription || null,
    items: partial.items || [],
    history: partial.history || [],
  };
}

test("tushum faqat tasdiqlangan to'lovdan, online va naqd alohida", () => {
  const range = { from: "2026-10-16", to: "2026-10-16" };
  const summary = summarizeDashboard({
    from: range.from,
    to: range.to,
    branches: [
      { id: "branch-a", name: "A" },
      { id: "branch-b", name: "B" },
    ],
    newCustomers: 2,
    orders: [
      order({
        id: "1",
        orderNumber: "ON-1",
        branchId: "branch-a",
        branchName: "A",
        createdAt: "2026-10-16T06:00:00+05:00",
        payment: { amount: 12000, provider: "CLICK", status: "COMPLETED", paidAt: "2026-10-16T07:00:00+05:00" },
        items: [{ medicineId: "m1", name: "Paracetamol", quantity: 2, unitPrice: 6000, medicine: { name: "Paracetamol" } }],
      }),
      order({
        id: "2",
        orderNumber: "CASH-1",
        branchId: "branch-b",
        branchName: "B",
        createdAt: "2026-10-16T08:00:00+05:00",
        payment: { amount: 8000, provider: "CASH", status: "COMPLETED", paidAt: "2026-10-16T08:10:00+05:00" },
        items: [{ medicineId: "m1", quantity: 1, unitPrice: 8000, medicine: { name: "Paracetamol" } }],
      }),
      order({
        id: "3",
        orderNumber: "WAIT-1",
        branchId: "branch-a",
        branchName: "A",
        status: "WAITING_PAYMENT",
        createdAt: "2026-10-16T09:00:00+05:00",
        payment: { amount: 5000, provider: "PAYME", status: "PENDING", paidAt: null },
      }),
      order({
        id: "4",
        orderNumber: "CX-1",
        branchId: "branch-a",
        branchName: "A",
        status: "CANCELLED",
        createdAt: "2026-10-16T10:00:00+05:00",
        prescription: { status: "REJECTED", createdAt: "2026-10-16T10:00:00+05:00" },
        refundStatus: "DONE",
        updatedAt: "2026-10-16T11:00:00+05:00",
        payment: { amount: 4000, provider: "CLICK", status: "COMPLETED", paidAt: "2026-10-15T12:00:00+05:00" },
      }),
    ],
  });

  assert.equal(summary.summary.revenueOnline, 12000);
  assert.equal(summary.summary.revenueCash, 8000);
  assert.equal(summary.summary.revenueTotal, 20000);
  assert.equal(summary.summary.orderCount, 4);
  assert.equal(summary.summary.paidCount, 2);
  assert.equal(summary.summary.averageCheck, 10000);
  assert.equal(summary.summary.cancelledCount, 1);
  assert.equal(summary.summary.cancelledShare, 0.25);
  assert.equal(summary.summary.rejectedCount, 1);
  assert.equal(summary.summary.refunds.done, 1);
  assert.equal(summary.summary.refunds.amount, 4000);
  assert.equal(summary.summary.newCustomers, 2);
  assert.equal(summary.topMedicines[0].name, "Paracetamol");
  assert.equal(summary.topMedicines[0].quantity, 3);
  assert.equal(summary.branches.length, 2);
  assert.equal(summary.days[0].orders, 4);
  assert.equal(summary.days[0].revenue, 20000);
});

test("qabul qilinmagan naqd tushumga kirmaydi", () => {
  const summary = summarizeDashboard({
    from: "2026-10-16",
    to: "2026-10-16",
    branches: [],
    orders: [
      order({
        id: "cash-due",
        orderNumber: "CASH-DUE",
        branchId: "branch-a",
        branchName: "A",
        status: "PREPARING",
        createdAt: "2026-10-16T08:00:00+05:00",
        payment: { amount: 9000, provider: "CASH", status: "PENDING", paidAt: null },
      }),
      order({
        id: "cash-in",
        orderNumber: "CASH-IN",
        branchId: "branch-a",
        branchName: "A",
        status: "COMPLETED",
        createdAt: "2026-10-16T09:00:00+05:00",
        payment: { amount: 3000, provider: "CASH", status: "COMPLETED", paidAt: "2026-10-16T09:10:00+05:00" },
      }),
    ],
  });
  assert.equal(summary.summary.revenueCash, 3000);
  assert.equal(summary.summary.revenueOnline, 0);
});

test("branchId siz kun chegarasi Toshkent vaqti bilan", () => {
  const range = resolveRange({ from: "2026-10-16", to: "2026-10-16" });
  assert.equal(range.error, undefined);
  assert.equal(dayKey("2026-10-16T19:30:00Z"), "2026-10-17");
  const summary = summarizeDashboard({
    from: "2026-10-17",
    to: "2026-10-17",
    branches: [],
    orders: [
      order({
        id: "late",
        orderNumber: "LATE",
        branchId: "branch-a",
        branchName: "A",
        createdAt: "2026-10-16T19:30:00Z",
        payment: { amount: 1000, provider: "PAYME", status: "COMPLETED", paidAt: "2026-10-16T19:30:00Z" },
      }),
    ],
  });
  assert.equal(summary.summary.revenueOnline, 1000);
  assert.equal(summary.summary.orderCount, 1);
});

test("noto'g'ri oraliq rad etiladi", () => {
  assert.equal(resolveRange({ from: "2026-10-20", to: "2026-10-01" }).error, "Boshlanish sanasi tugashdan oldin bo'lishi kerak");
});

test("buyurtma hisoboti csv qatori", () => {
  const summary = summarizeDashboard({
    from: "2026-10-16",
    to: "2026-10-16",
    branches: [{ id: "branch-a", name: "A" }],
    orders: [
      order({
        id: "1",
        orderNumber: "ON-1",
        branchId: "branch-a",
        branchName: "A",
        createdAt: "2026-10-16T06:00:00+05:00",
        payment: { amount: 1000, provider: "CASH", status: "COMPLETED", paidAt: "2026-10-16T06:00:00+05:00" },
      }),
    ],
  });
  const rows = reportRows("orders", summary, summary.branches.length ? [
    order({
      id: "1",
      orderNumber: "ON-1",
      branchId: "branch-a",
      branchName: "A",
      createdAt: "2026-10-16T06:00:00+05:00",
      payment: { amount: 1000, provider: "CASH", status: "COMPLETED", paidAt: "2026-10-16T06:00:00+05:00" },
    }),
  ] : [], { from: "2026-10-16", to: "2026-10-16" });
  const csv = toCsv(rows);
  assert.match(csv, /Raqam/);
  assert.match(csv, /ON-1/);
  assert.match(csv, /Naqd|CASH/);
});
