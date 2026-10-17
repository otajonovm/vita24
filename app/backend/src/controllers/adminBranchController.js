const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { encryptSecret, maskSecret } = require("../lib/secrets");
const { writeAudit } = require("../lib/audit");
const { todayKey } = require("../lib/dashboardStats");
const { WEEK, formatWorkingHours, parseWorkingHours, slugify } = require("../lib/branchProfile");

const ACTIVE_ORDER_STATUSES = [
  "PENDING_PRESCRIPTION",
  "PENDING_BRANCH",
  "WAITING_PAYMENT",
  "PAID",
  "PREPARING",
  "READY",
  "DELIVERING",
];

async function uniqueSlug(name, ignoreId) {
  const base = slugify(name) || "filial";
  let slug = base;
  let index = 2;

  while (true) {
    const existing = await prisma.branch.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${base}-${index}`.slice(0, 56);
    index += 1;
  }
}

function emptyToNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function lekkoKeyData(incoming) {
  if (incoming === undefined) return undefined;
  const plain = emptyToNull(incoming);
  if (!plain) return undefined;
  return encryptSecret(plain);
}

function defaultHours() {
  const day = { open: "08:00", close: "23:00", closed: false };
  return Object.fromEntries(WEEK.map((key) => [key, day]));
}

function storeHours(value) {
  if (!value) return JSON.stringify(defaultHours());
  if (value.allDay) return JSON.stringify({ allDay: true });
  return JSON.stringify(value);
}

function branchFields(branch) {
  return {
    name: branch.name,
    slug: branch.slug,
    address: branch.address,
    phone: branch.phone,
    city: branch.city,
    district: branch.district,
    isActive: branch.isActive,
    lowStockThreshold: branch.lowStockThreshold ?? 5,
    deliveryRadiusKm: branch.deliveryRadiusKm,
    lekkoDrugStoreId: branch.lekkoDrugStoreId,
    archivedAt: branch.archivedAt || null,
  };
}

function keyFields(branch) {
  const key = maskSecret(branch.lekkoApiKey);
  return { hasLekkoKey: key.hasLekkoKey, lekkoKeyLast4: key.lekkoKeyLast4 };
}

function branchStatus(branch) {
  if (branch.archivedAt) return "archived";
  return branch.isActive ? "active" : "inactive";
}

function serializeBranch(branch, stats = {}) {
  const key = maskSecret(branch.lekkoApiKey);
  return {
    id: branch.id,
    name: branch.name,
    slug: branch.slug,
    address: branch.address,
    phone: branch.phone,
    city: branch.city,
    district: branch.district,
    workingHours: formatWorkingHours(branch.workingHours),
    hours: parseWorkingHours(branch.workingHours),
    lat: branch.lat ?? null,
    lng: branch.lng ?? null,
    deliveryRadiusKm: branch.deliveryRadiusKm ?? 5,
    lowStockThreshold: branch.lowStockThreshold ?? 5,
    isActive: branch.isActive,
    isOpen: branch.isOpen,
    archivedAt: branch.archivedAt,
    status: branchStatus(branch),
    pharmacistCount: stats.pharmacists || 0,
    todayOrders: stats.todayOrders || 0,
    todayRevenue: stats.todayRevenue || 0,
    activeOrders: stats.activeOrders || 0,
    orderCount: stats.orderCount || 0,
    hasLekkoKey: key.hasLekkoKey,
    lekkoLastError: branch.lekkoLastError || null,
    lekkoLastErrorAt: branch.lekkoLastErrorAt,
    lekkoKeyLast4: key.lekkoKeyLast4,
    lekkoDrugStoreId: branch.lekkoDrugStoreId,
    lastSyncedAt: branch.lastSyncedAt,
  };
}

async function branchStats() {
  const day = todayKey();
  const start = new Date(`${day}T00:00:00+05:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const [staff, orders, active, paid] = await Promise.all([
    prisma.user.groupBy({
      by: ["branchId"],
      where: { role: "BRANCH_ADMIN", branchId: { not: null } },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["branchId"],
      where: { createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["branchId"],
      where: { status: { in: ACTIVE_ORDER_STATUSES } },
      _count: { _all: true },
    }),
    prisma.order.findMany({
      where: { payment: { is: { status: "COMPLETED", paidAt: { gte: start, lt: end } } } },
      select: { branchId: true, payment: { select: { amount: true } } },
    }),
  ]);
  const totals = await prisma.order.groupBy({ by: ["branchId"], _count: { _all: true } });
  const map = new Map();
  const bucket = (id) => {
    if (!map.has(id)) {
      map.set(id, { pharmacists: 0, todayOrders: 0, todayRevenue: 0, activeOrders: 0, orderCount: 0 });
    }
    return map.get(id);
  };
  for (const row of staff) if (row.branchId) bucket(row.branchId).pharmacists = row._count._all;
  for (const row of orders) bucket(row.branchId).todayOrders = row._count._all;
  for (const row of active) bucket(row.branchId).activeOrders = row._count._all;
  for (const row of totals) bucket(row.branchId).orderCount = row._count._all;
  for (const row of paid) {
    const item = bucket(row.branchId);
    item.todayRevenue = Math.round((item.todayRevenue + Number(row.payment?.amount || 0)) * 100) / 100;
  }
  return map;
}

async function resolveSlug(name, requested, ignoreId) {
  const manual = requested ? slugify(requested) : "";
  if (manual) {
    const existing = await prisma.branch.findUnique({ where: { slug: manual }, select: { id: true } });
    if (existing && existing.id !== ignoreId) {
      throw new AppError("Bu slug band", 409, "SLUG_TAKEN");
    }
    return manual;
  }
  return uniqueSlug(name, ignoreId);
}

function storeId(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

const listBranches = asyncHandler(async (_req, res) => {
  const [branches, stats] = await Promise.all([
    prisma.branch.findMany({ orderBy: { name: "asc" } }),
    branchStats(),
  ]);
  return sendSuccess(
    res,
    branches.map((branch) => serializeBranch(branch, stats.get(branch.id))),
    "Filiallar"
  );
});

const createBranch = asyncHandler(async (req, res) => {
  const body = req.body;
  const branch = await prisma.branch.create({
    data: {
      name: body.name.trim(),
      slug: await resolveSlug(body.name, body.slug),
      address: body.address.trim(),
      phone: body.phone.trim(),
      city: body.city?.trim() || "Toshkent",
      district: body.district?.trim() || "Toshkent",
      workingHours: storeHours(body.workingHours),
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      deliveryRadiusKm: body.deliveryRadiusKm || 5,
      isActive: body.isActive !== false,
      lekkoApiKey: lekkoKeyData(body.lekkoApiKey) ?? null,
      lekkoDrugStoreId: storeId(body.lekkoDrugStoreId),
    },
  });

  await writeAudit(prisma, {
    req,
    action: body.lekkoApiKey ? "LEKKO_KEY_SET" : "BRANCH_CREATED",
    entityType: "Branch",
    entityId: branch.id,
    branchId: branch.id,
    summary: branch.name,
    after: body.lekkoApiKey ? keyFields(branch) : branchFields(branch),
  });
  if (body.lekkoApiKey) {
    await writeAudit(prisma, {
      req,
      action: "BRANCH_CREATED",
      entityType: "Branch",
      entityId: branch.id,
      branchId: branch.id,
      summary: branch.name,
      after: branchFields(branch),
    });
  }

  return sendSuccess(res, serializeBranch(branch), "Filial qo'shildi", 201);
});

const updateBranch = asyncHandler(async (req, res) => {
  const current = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!current) {
    throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  }

  const body = req.body;
  const data = {};
  if (body.name != null) data.name = body.name.trim();
  if (body.slug != null) data.slug = await resolveSlug(body.name || current.name, body.slug, current.id);
  if (body.address != null) data.address = body.address.trim();
  if (body.phone != null) data.phone = body.phone.trim();
  if (body.city != null) data.city = body.city.trim();
  if (body.district != null) data.district = body.district.trim();
  if (body.workingHours != null) data.workingHours = storeHours(body.workingHours);
  if (body.lat !== undefined) data.lat = body.lat;
  if (body.lng !== undefined) data.lng = body.lng;
  if (body.deliveryRadiusKm != null) data.deliveryRadiusKm = body.deliveryRadiusKm;
  if (body.lowStockThreshold != null) data.lowStockThreshold = body.lowStockThreshold;
  if (body.isActive != null) data.isActive = body.isActive;
  const nextKey = lekkoKeyData(body.lekkoApiKey);
  if (nextKey) data.lekkoApiKey = nextKey;
  if (body.lekkoDrugStoreId !== undefined) data.lekkoDrugStoreId = storeId(body.lekkoDrugStoreId);

  const branch = await prisma.branch.update({ where: { id: current.id }, data });
  const other = { ...data };
  delete other.lekkoApiKey;
  if (Object.keys(other).length) {
    await writeAudit(prisma, {
      req,
      action: "BRANCH_UPDATED",
      entityType: "Branch",
      entityId: branch.id,
      branchId: branch.id,
      summary: branch.name,
      before: branchFields(current),
      after: branchFields(branch),
    });
  }
  if (nextKey) {
    await writeAudit(prisma, {
      req,
      action: "LEKKO_KEY_SET",
      entityType: "Branch",
      entityId: branch.id,
      branchId: branch.id,
      summary: `${branch.name}: kalit yangilandi`,
      before: keyFields(current),
      after: keyFields(branch),
    });
  }
  return sendSuccess(res, serializeBranch(branch), "Filial yangilandi");
});

const clearLekkoKey = asyncHandler(async (req, res) => {
  const current = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!current) {
    throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  }
  if (req.body?.confirm !== true) {
    throw new AppError("Kalitni o'chirishni tasdiqlang", 400, "VALIDATION_ERROR");
  }

  const branch = await prisma.branch.update({
    where: { id: current.id },
    data: { lekkoApiKey: null },
  });
  await writeAudit(prisma, {
    req,
    action: "LEKKO_KEY_CLEARED",
    entityType: "Branch",
    entityId: branch.id,
    branchId: branch.id,
    summary: `${branch.name}: kalit o'chirildi`,
    before: keyFields(current),
    after: keyFields(branch),
  });
  return sendSuccess(res, serializeBranch(branch), "LEKKO kaliti o'chirildi");
});

const toggleBranch = asyncHandler(async (req, res) => {
  const current = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!current) {
    throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  }

  const branch = await prisma.branch.update({
    where: { id: current.id },
    data: { isActive: !current.isActive },
  });

  await writeAudit(prisma, {
    req,
    action: "BRANCH_TOGGLED",
    entityType: "Branch",
    entityId: branch.id,
    branchId: branch.id,
    summary: branch.name,
    before: { isActive: current.isActive },
    after: { isActive: branch.isActive },
  });
  return sendSuccess(
    res,
    serializeBranch(branch),
    branch.isActive ? "Filial faollashtirildi" : "Filial o'chirildi"
  );
});

async function attachedPharmacists(branchId) {
  return prisma.user.findMany({
    where: { branchId, role: "BRANCH_ADMIN", deletedAt: null },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });
}

function staffBlockError(staff) {
  const names = staff.map((row) => row.name || row.phone).join(", ");
  return new AppError(
    `Filialda farmatsevtlar bor: ${names}. Avval ularni boshqa filialga o'tkazing yoki amalni bekor qiling`,
    409,
    "HAS_STAFF",
    { staff }
  );
}

const deleteBranch = asyncHandler(async (req, res) => {
  const current = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!current) throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  const orders = await prisma.order.count({ where: { branchId: current.id } });
  if (orders > 0) {
    throw new AppError("Buyurtmasi bor filial o'chirilmaydi. Uni arxivlang", 409, "HAS_ORDERS");
  }
  const staff = await attachedPharmacists(current.id);
  if (staff.length) throw staffBlockError(staff);
  await prisma.branch.delete({ where: { id: current.id } });
  await writeAudit(prisma, {
    req,
    action: "BRANCH_DELETED",
    entityType: "Branch",
    entityId: current.id,
    branchId: current.id,
    summary: current.name,
    before: branchFields(current),
    after: { deleted: true },
  });
  return sendSuccess(res, { id: current.id }, "Filial o'chirildi");
});

const archiveBranch = asyncHandler(async (req, res) => {
  const current = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!current) throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  const orders = await prisma.order.count({ where: { branchId: current.id } });
  if (orders === 0) {
    throw new AppError("Buyurtmasi yo'q filialni o'chiring", 409, "NO_ORDERS");
  }
  const staff = await attachedPharmacists(current.id);
  if (staff.length) throw staffBlockError(staff);
  const branch = await prisma.branch.update({
    where: { id: current.id },
    data: { archivedAt: new Date(), isActive: false },
  });
  await writeAudit(prisma, {
    req,
    action: "BRANCH_ARCHIVED",
    entityType: "Branch",
    entityId: branch.id,
    branchId: branch.id,
    summary: branch.name,
    before: { isActive: current.isActive, archivedAt: current.archivedAt },
    after: { isActive: false, archivedAt: branch.archivedAt },
  });
  return sendSuccess(res, serializeBranch(branch), "Filial arxivlandi");
});

const unarchiveBranch = asyncHandler(async (req, res) => {
  const current = await prisma.branch.findUnique({ where: { id: req.params.id } });
  if (!current) throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  const branch = await prisma.branch.update({
    where: { id: current.id },
    data: { archivedAt: null },
  });
  await writeAudit(prisma, {
    req,
    action: "BRANCH_UNARCHIVED",
    entityType: "Branch",
    entityId: branch.id,
    branchId: branch.id,
    summary: branch.name,
    before: { archivedAt: current.archivedAt },
    after: { archivedAt: null },
  });
  return sendSuccess(res, serializeBranch(branch), "Filial arxivdan chiqarildi");
});

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  clearLekkoKey,
  toggleBranch,
  deleteBranch,
  archiveBranch,
  unarchiveBranch,
  lekkoKeyData,
};
