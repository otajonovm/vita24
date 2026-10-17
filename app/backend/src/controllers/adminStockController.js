const { Prisma } = require("../../generated/prisma");
const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess } = require("../lib/response");
const { availableCount } = require("../lib/stock");

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const networkStock = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const filter = String(req.query.filter || "all");
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const like = `%${search}%`;
  const searchSql = search
    ? Prisma.sql`AND (m.name ILIKE ${like} OR COALESCE(m.barcode, '') ILIKE ${like} OR COALESCE(m."activeIngredient", '') ILIKE ${like})`
    : Prisma.empty;
  const filterSql =
    filter === "low"
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "BranchStock" s
          JOIN "Branch" b ON b.id = s."branchId"
          WHERE s."medicineId" = m.id AND b."archivedAt" IS NULL
            AND (s."stockCount" - s."reservedCount") > 0
            AND (s."stockCount" - s."reservedCount") < b."lowStockThreshold"
        )`
      : filter === "out"
        ? Prisma.sql`AND EXISTS (
            SELECT 1 FROM "BranchStock" s
            JOIN "Branch" b ON b.id = s."branchId"
            WHERE s."medicineId" = m.id AND b."archivedAt" IS NULL
              AND (s."stockCount" - s."reservedCount") <= 0
          )`
        : Prisma.empty;

  const [branches, countRows, idRows] = await Promise.all([
    prisma.branch.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, lowStockThreshold: true },
      orderBy: { name: "asc" },
    }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM "Medicine" m
      WHERE m."isActive" = true
      ${searchSql}
      ${filterSql}
    `,
    prisma.$queryRaw`
      SELECT m.id
      FROM "Medicine" m
      WHERE m."isActive" = true
      ${searchSql}
      ${filterSql}
      ORDER BY m.name ASC
      LIMIT ${limit} OFFSET ${skip}
    `,
  ]);

  const ids = idRows.map((row) => row.id);
  const medicines = ids.length
    ? await prisma.medicine.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          basePrice: true,
          stocks: {
            where: { branch: { archivedAt: null } },
            select: { branchId: true, price: true, stockCount: true, reservedCount: true },
          },
        },
      })
    : [];
  const byId = new Map(medicines.map((item) => [item.id, item]));
  const thresholds = new Map(branches.map((branch) => [branch.id, branch.lowStockThreshold || 5]));

  return sendSuccess(
    res,
    {
      page,
      limit,
      total: Number(countRows[0]?.count || 0),
      branches: branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        lowStockThreshold: branch.lowStockThreshold || 5,
      })),
      items: ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((medicine) => {
          const basePrice = money(medicine.basePrice);
          const cells = {};
          for (const stock of medicine.stocks) {
            const available = availableCount(stock);
            const price = money(stock.price);
            const threshold = thresholds.get(stock.branchId) || 5;
            cells[stock.branchId] = {
              stockCount: stock.stockCount,
              available,
              price,
              priceDiffers: price !== basePrice,
              low: available > 0 && available < threshold,
              out: available <= 0,
            };
          }
          return { id: medicine.id, name: medicine.name, basePrice, cells };
        }),
    },
    "Tarmoq ombori"
  );
});

const listMovements = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const branchId = String(req.query.branchId || "").trim();
  const search = String(req.query.search || "").trim();
  const reason = String(req.query.reason || "").trim();
  const from = req.query.from ? new Date(`${req.query.from}T00:00:00+05:00`) : null;
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999+05:00`) : null;
  const where = {
    ...(reason ? { reason } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    branchStock: {
      ...(branchId ? { branchId } : {}),
      ...(search
        ? { medicine: { name: { contains: search, mode: "insensitive" } } }
        : {}),
    },
  };
  const [total, rows] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        branchStock: {
          select: {
            branch: { select: { id: true, name: true } },
            medicine: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  const actorIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));
  return sendSuccess(
    res,
    {
      page,
      limit,
      total,
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        delta: row.delta,
        beforeCount: row.beforeCount,
        afterCount: row.afterCount,
        reason: row.reason,
        note: row.note || "",
        actorName: names.get(row.userId) || "",
        branchName: row.branchStock?.branch?.name || "",
        medicineName: row.branchStock?.medicine?.name || "",
      })),
    },
    "Ombor harakatlari"
  );
});

module.exports = { networkStock, listMovements };
