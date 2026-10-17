const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess } = require("../lib/response");
const { pageWindow } = require("../lib/panelRules");

function dayBound(value, end) {
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+05:00`);
}

const listAudit = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageWindow(req.query);
  const where = {};
  if (req.query.userId) {
    where.OR = [{ userId: req.query.userId }, { actorId: req.query.userId }];
  }
  if (req.query.action) where.action = req.query.action;
  if (req.query.entityType) where.entityType = req.query.entityType;
  const staffOnly =
    req.query.staffOnly === undefined ||
    req.query.staffOnly === "" ||
    String(req.query.staffOnly).toLowerCase() === "true" ||
    req.query.staffOnly === "1";
  if (staffOnly) {
    where.AND = [
      ...(where.AND || []),
      { OR: [{ role: null }, { role: { not: "CUSTOMER" } }] },
    ];
  }
  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt.gte = dayBound(req.query.from, false);
    if (req.query.to) where.createdAt.lte = dayBound(req.query.to, true);
  }

  const [total, rows, actorRows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.findMany({
      where: { actorId: { not: null } },
      select: { actorId: true, actorName: true, role: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
  ]);
  const seen = new Set();
  const actors = [];
  for (const row of actorRows) {
    if (seen.has(row.actorId)) continue;
    seen.add(row.actorId);
    actors.push({ actorId: row.actorId, actorName: row.actorName, role: row.role });
  }

  return sendSuccess(
    res,
    {
      items: rows.map((row) => ({ ...row, userId: row.userId || row.actorId })),
      actors,
      total,
      page,
      limit,
    },
    "Audit jurnali"
  );
});

module.exports = { listAudit };
