const { Prisma } = require("../../generated/prisma");
const prisma = require("../lib/prisma");
const { asyncHandler, AppError } = require("../lib/response");
const { sendSuccess } = require("../lib/response");
const {
  LOW_STOCK_THRESHOLD,
  SLOW_RX_MINUTES,
  resolveRange,
  summarizeDashboard,
  reportRows,
} = require("../lib/dashboardStats");
const { toCsv, toXlsx } = require("../lib/reportFile");
const { writeAudit } = require("../lib/audit");

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  branchId: true,
  status: true,
  customerName: true,
  customerPhone: true,
  subtotal: true,
  deliveryFee: true,
  discount: true,
  refundStatus: true,
  deliveryType: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
  payment: { select: { amount: true, provider: true, status: true, paidAt: true, updatedAt: true } },
  prescription: { select: { status: true, createdAt: true } },
  items: { select: { medicineId: true, quantity: true, unitPrice: true, medicine: { select: { name: true } } } },
  history: { select: { fromStatus: true, toStatus: true, createdAt: true } },
};

function plainOrder(order) {
  return {
    ...order,
    subtotal: Number(order.subtotal || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    discount: Number(order.discount || 0),
    payment: order.payment
      ? { ...order.payment, amount: Number(order.payment.amount || 0) }
      : null,
    items: (order.items || []).map((item) => ({ ...item, unitPrice: Number(item.unitPrice || 0) })),
  };
}

async function loadScope(query) {
  const range = resolveRange(query);
  if (range.error) throw new AppError(range.error, 400, "VALIDATION_ERROR");

  let branch = null;
  if (query.branchId) {
    branch = await prisma.branch.findUnique({ where: { id: query.branchId }, select: { id: true, name: true, isOpen: true, lowStockThreshold: true } });
    if (!branch) throw new AppError("Filial topilmadi", 400, "VALIDATION_ERROR");
  }

  const branchWhere = query.branchId ? { branchId: query.branchId } : {};
  const [orders, branchList, newCustomers, lowStockRows, pendingRefunds, slowPrescriptions, lekkoErrors, closedBranches, lekkoItems] = await Promise.all([
    prisma.order.findMany({
      where: {
        ...branchWhere,
        OR: [
          { createdAt: { gte: range.start, lt: range.end } },
          { payment: { is: { status: "COMPLETED", paidAt: { gte: range.start, lt: range.end } } } },
          { payment: { is: { status: "COMPLETED", paidAt: null, updatedAt: { gte: range.start, lt: range.end } } } },
          { refundStatus: { in: ["PENDING", "DONE"] }, updatedAt: { gte: range.start, lt: range.end } },
          { history: { some: { createdAt: { gte: range.start, lt: range.end }, fromStatus: { in: ["PENDING_PRESCRIPTION", "DELIVERING"] } } } },
        ],
      },
      select: ORDER_SELECT,
    }),
    prisma.branch.findMany({
      where: query.branchId ? { id: query.branchId } : {},
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.count({
      where: {
        role: "CUSTOMER",
        createdAt: { gte: range.start, lt: range.end },
        ...(query.branchId ? { orders: { some: { branchId: query.branchId } } } : {}),
      },
    }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "BranchStock" s
      JOIN "Branch" b ON b.id = s."branchId"
      WHERE (s."stockCount" - s."reservedCount") > 0
        AND (s."stockCount" - s."reservedCount") < b."lowStockThreshold"
        ${query.branchId ? Prisma.sql`AND s."branchId" = ${query.branchId}` : Prisma.empty}
    `,
    prisma.order.count({ where: { ...branchWhere, refundStatus: "PENDING" } }),
    prisma.order.count({
      where: {
        ...branchWhere,
        status: "PENDING_PRESCRIPTION",
        createdAt: { lt: new Date(Date.now() - SLOW_RX_MINUTES * 60 * 1000) },
      },
    }),
    prisma.branch.count({
      where: {
        ...(query.branchId ? { id: query.branchId } : {}),
        lekkoLastError: { not: null },
      },
    }),
    prisma.branch.count({
      where: {
        ...(query.branchId ? { id: query.branchId } : {}),
        isOpen: false,
      },
    }),
    prisma.branch.findMany({
      where: {
        ...(query.branchId ? { id: query.branchId } : {}),
        lekkoLastError: { not: null },
      },
      select: { id: true, name: true, lekkoLastError: true, lekkoLastErrorAt: true },
      orderBy: { lekkoLastErrorAt: "desc" },
      take: 5,
    }),
  ]);

  const summary = summarizeDashboard({
    orders: orders.map(plainOrder),
    branches: branchList,
    newCustomers,
    from: range.from,
    to: range.to,
  });

  return {
    branchId: branch?.id || null,
    ...summary,
    alerts: {
      lowStock: Number(lowStockRows?.[0]?.count || 0),
      lowStockThreshold: branch?.lowStockThreshold || LOW_STOCK_THRESHOLD,
      pendingRefunds,
      slowPrescriptions,
      slowPrescriptionMinutes: SLOW_RX_MINUTES,
      lekkoErrors,
      lekkoItems: (lekkoItems || []).map((item) => ({
        id: item.id,
        name: item.name,
        message: item.lekkoLastError,
        at: item.lekkoLastErrorAt,
      })),
      closedBranches,
    },
    orders: orders.map(plainOrder),
  };
}

const getDashboard = asyncHandler(async (req, res) => {
  const data = await loadScope(req.query);
  delete data.orders;
  return sendSuccess(res, data, "Dashboard");
});

const exportReport = asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  const allowed = ["orders", "revenue", "branches", "medicines"];
  if (!allowed.includes(kind)) throw new AppError("Hisobot turi noto'g'ri", 400, "VALIDATION_ERROR");
  const format = req.query.format === "xlsx" ? "xlsx" : "csv";
  const data = await loadScope(req.query);
  const rows = reportRows(kind, data, data.orders, data.range);
  const filename = `vita24-${kind}-${data.range.from}-${data.range.to}.${format}`;
  await writeAudit(prisma, {
    req,
    action: "REPORT_EXPORT",
    entityType: "Report",
    entityId: kind,
    branchId: req.query.branchId || null,
    summary: `${kind} (${format}) ${data.range.from}–${data.range.to}`,
    after: {
      kind,
      format,
      from: data.range.from,
      to: data.range.to,
      branchId: req.query.branchId || null,
    },
  });
  if (format === "xlsx") {
    const buffer = await toXlsx(rows);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(buffer);
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(toCsv(rows));
});

module.exports = { getDashboard, exportReport, loadScope };
