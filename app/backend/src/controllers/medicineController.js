const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess, AppError } = require("../lib/response");
const { availableCount, stockLevel } = require("../lib/stock");
const { searchVariants, suggestName } = require("../lib/searchText");

// Strength such as "500 mg", "100 mg/5 ml", "5мг/10мг", "200мл" taken from the product name.
const DOSAGE_PATTERN =
  /\d+(?:[.,]\d+)?\s?(?:mcg|mg|ml|iu|g|мкг|мг|мл|ме|г|%)(?:\s?\/\s?\d+(?:[.,]\d+)?\s?(?:mcg|mg|ml|g|мкг|мг|мл|г))?/i;

function strengthOnly(medicine) {
  const strength = String(medicine.name || "").match(DOSAGE_PATTERN)?.[0];
  return strength ? strength.replace(/\s+/g, " ").trim() : "";
}

function resolveDosage(medicine) {
  const stored = String(medicine.dosage || "").trim();
  if (stored) return stored;
  const strength = strengthOnly(medicine);
  if (strength) return strength;
  const form = String(medicine.dosageForm || "").trim();
  return form && form !== "Noma'lum" ? form : "";
}

/**
 * With a branch: price and stock come from that branch's BranchStock row.
 * Without a branch there is no single price, so price is null and
 * stockCount is the total across active branches.
 */
function mapMedicine(medicine, branchId) {
  const stocks = medicine.stocks || [];
  const branchStock = branchId ? stocks.find((item) => item.branchId === branchId) || null : null;

  const stockCount = branchId
    ? Number(branchStock?.stockCount || 0)
    : stocks.reduce((sum, item) => sum + Number(item.stockCount || 0), 0);
  const reservedCount = branchId
    ? Number(branchStock?.reservedCount || 0)
    : stocks.reduce((sum, item) => sum + Number(item.reservedCount || 0), 0);

  return {
    id: medicine.id,
    name: medicine.name,
    dosage: String(medicine.dosage || "").trim() || strengthOnly(medicine),
    dosageLabel: resolveDosage(medicine),
    imageUrl: medicine.imageUrl || null,
    isPrescription: medicine.isPrescription,
    showOnHome: Boolean(medicine.showOnHome),
    homeSortOrder: Number(medicine.homeSortOrder) || 0,
    price: branchStock ? Number(branchStock.price) : null,
    stockCount,
    category: medicine.category,
    slug: medicine.slug,
    description: medicine.description,
    manufacturer: medicine.manufacturer,
    dosageForm: medicine.dosageForm,
    imageEmoji: medicine.imageEmoji,
    externalApiId: medicine.externalApiId,
    barcode: medicine.barcode || null,
    ikpuCode: medicine.ikpuCode || null,
    quantityInPack: medicine.quantityInPack || 1,
    activeIngredient: String(medicine.activeIngredient || "").trim(),
    usage: String(medicine.usage || "").trim(),
    contraindications: String(medicine.contraindications || "").trim(),
    storageConditions: String(medicine.storageConditions || "").trim(),
    reservedCount,
    available: availableCount({ stockCount, reservedCount }),
  };
}

function compareForStorefront(a, b) {
  return (
    Number(b.stockCount > 0) - Number(a.stockCount > 0) ||
    Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) ||
    a.name.localeCompare(b.name, "uz")
  );
}

function branchStockWhere(branchId) {
  return {
    some: {
      ...(branchId ? { branchId } : {}),
      OR: [{ stockCount: { gt: 0 } }, { reservedCount: { gt: 0 } }, { price: { gt: 0 } }],
    },
  };
}

const listCategories = asyncHandler(async (req, res) => {
  const branchId = String(req.query.branchId || "").trim();
  const ownedMedicines = { isActive: true, stocks: branchStockWhere(branchId) };
  const categories = await prisma.category.findMany({
    where: { medicines: { some: ownedMedicines } },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      sortOrder: true,
      _count: {
        select: {
          medicines: { where: ownedMedicines },
        },
      },
    },
  });

  return sendSuccess(
    res,
    categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      sortOrder: category.sortOrder,
      medicineCount: category._count.medicines,
    })),
    "Toifalar ro'yxati"
  );
});

async function resolveStorefrontBranchId(branchId) {
  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: String(branchId), isActive: true },
      select: { id: true },
    });
    if (!branch) {
      throw new AppError("Filial topilmadi yoki faol emas", 404, "NOT_FOUND");
    }
    return branch.id;
  }

  const yunusobod = await prisma.branch.findFirst({
    where: { isActive: true, slug: "yunusobod" },
    select: { id: true },
  });
  if (yunusobod) return yunusobod.id;

  const lekko = await prisma.branch.findFirst({
    where: {
      isActive: true,
      lekkoApiKey: { not: null },
      NOT: { lekkoApiKey: "" },
    },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (lekko) return lekko.id;

  const fallback = await prisma.branch.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  if (!fallback) {
    throw new AppError("Faol filial topilmadi", 404, "NOT_FOUND");
  }
  return fallback.id;
}

/**
 * GET /api/medicines?branchId&categoryId&search&page&limit
 * branchId bo'lmasa Yunusobod (LEKKO filiali) olinadi.
 * Tartib: omborda bor -> rasmi bor -> alfavit.
 */
const listMedicines = asyncHandler(async (req, res) => {
  const { branchId, categoryId, search, inStockOnly, featured, page, limit, sort } = req.query;
  const resolvedBranchId = await resolveStorefrontBranchId(branchId);
  const stockFilter = {
    branchId: resolvedBranchId,
    ...(inStockOnly ? { stockCount: { gt: 0 } } : {}),
  };

  const variants = search ? searchVariants(search) : [];

  const medicines = await prisma.medicine.findMany({
    where: {
      isActive: true,
      ...(featured ? { showOnHome: true } : {}),
      stocks: { some: stockFilter },
      ...(categoryId ? { categoryId } : {}),
      ...(variants.length
        ? {
            OR: variants.flatMap((term) => [
              { name: { contains: term, mode: "insensitive" } },
              { description: { contains: term, mode: "insensitive" } },
              { manufacturer: { contains: term, mode: "insensitive" } },
              { barcode: { contains: term, mode: "insensitive" } },
              { ikpuCode: { contains: term, mode: "insensitive" } },
            ]),
          }
        : {}),
    },
    include: {
      category: { select: { id: true, name: true, slug: true, icon: true } },
      stocks: {
        where: { branchId: resolvedBranchId },
        select: { branchId: true, price: true, stockCount: true, reservedCount: true },
      },
    },
  });

  const mapped = medicines.map((medicine) => mapMedicine(medicine, resolvedBranchId));
  const sorted =
    featured && (!sort || sort === "default" || sort === "popular")
      ? [...mapped].sort((a, b) => a.homeSortOrder - b.homeSortOrder || a.name.localeCompare(b.name, "uz"))
      : applyCatalogSort(mapped, sort);
  const total = sorted.length;
  const start = (page - 1) * limit;
  const missed = variants.length > 0 && total === 0;
  const hint = missed ? await searchMiss(resolvedBranchId, search) : { suggestion: "", popular: [], categories: [] };

  return sendSuccess(
    res,
    {
      items: sorted.slice(start, start + limit),
      page,
      limit,
      total,
      branchId: resolvedBranchId,
      suggestion: hint.suggestion,
      popular: hint.popular,
      categories: hint.categories,
    },
    "Dorilar katalogi"
  );
});

async function searchMiss(branchId, search) {
  const stockInclude = {
    category: { select: { id: true, name: true, slug: true, icon: true } },
    stocks: {
      where: { branchId },
      select: { branchId: true, price: true, stockCount: true, reservedCount: true },
    },
  };
  const [names, featured, categories] = await Promise.all([
    prisma.medicine.findMany({
      where: { isActive: true, stocks: { some: { branchId } } },
      select: { name: true },
    }),
    prisma.medicine.findMany({
      where: { isActive: true, showOnHome: true, stocks: { some: { branchId, stockCount: { gt: 0 } } } },
      include: stockInclude,
      orderBy: [{ homeSortOrder: "asc" }, { name: "asc" }],
      take: 8,
    }),
    prisma.category.findMany({
      where: { medicines: { some: { isActive: true, stocks: { some: { branchId, stockCount: { gt: 0 } } } } } },
      orderBy: { sortOrder: "asc" },
      take: 8,
      select: { id: true, name: true, slug: true },
    }),
  ]);
  let popular = featured;
  if (popular.length < 4) {
    const more = await prisma.medicine.findMany({
      where: {
        isActive: true,
        stocks: { some: { branchId, stockCount: { gt: 0 } } },
        id: { notIn: popular.map((item) => item.id) },
      },
      include: stockInclude,
      orderBy: { name: "asc" },
      take: 8 - popular.length,
    });
    popular = [...popular, ...more];
  }
  return {
    suggestion: suggestName(search, names.map((item) => item.name)),
    popular: popular.map((item) => mapMedicine(item, branchId)),
    categories,
  };
}

function applyCatalogSort(items, sort) {
  const list = [...items];
  if (sort === "price_asc") {
    return list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0) || a.name.localeCompare(b.name, "uz"));
  }
  if (sort === "price_desc") {
    return list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0) || a.name.localeCompare(b.name, "uz"));
  }
  if (sort === "name") {
    return list.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  }
  return list.sort(
    (a, b) =>
      Number(Boolean(b.showOnHome)) - Number(Boolean(a.showOnHome)) ||
      (Number(a.homeSortOrder) || 0) - (Number(b.homeSortOrder) || 0) ||
      a.name.localeCompare(b.name, "uz")
  );
}

const getMedicineBySlug = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  const branchId = await resolveStorefrontBranchId(req.query.branchId);
  const medicine = await prisma.medicine.findUnique({
    where: { slug },
    include: {
      category: { select: { id: true, name: true, slug: true, icon: true } },
      stocks: {
        where: { branch: { isActive: true } },
        select: {
          price: true,
          stockCount: true,
          reservedCount: true,
          branchId: true,
          branch: { select: { id: true, name: true, district: true, slug: true } },
        },
      },
    },
  });

  if (!medicine || medicine.isActive === false) {
    throw new AppError("Dori topilmadi", 404, "NOT_FOUND");
  }

  const ingredient = String(medicine.activeIngredient || "").trim();
  const analogRows = ingredient
    ? await prisma.medicine.findMany({
        where: {
          id: { not: medicine.id },
          isActive: true,
          activeIngredient: { equals: ingredient, mode: "insensitive" },
          stocks: { some: { branchId } },
        },
        include: {
          category: { select: { id: true, name: true, slug: true, icon: true } },
          stocks: {
            where: { branchId },
            select: { branchId: true, price: true, stockCount: true, reservedCount: true },
          },
        },
        orderBy: { name: "asc" },
        take: 12,
      })
    : [];

  const availability = medicine.stocks.map((stock) => {
    const count = availableCount(stock);
    return {
      branchId: stock.branchId,
      name: stock.branch.name,
      district: stock.branch.district,
      slug: stock.branch.slug,
      price: Number(stock.price),
      level: stockLevel(count),
      available: count > 0,
    };
  });

  return sendSuccess(
    res,
    {
      ...mapMedicine(medicine, branchId),
      availability,
      analogs: analogRows.map((item) => mapMedicine(item, branchId)),
    },
    "Dori tafsiloti"
  );
});

const cartAvailability = asyncHandler(async (req, res) => {
  const branchId = String(req.query.branchId || "").trim();
  const ids = [...new Set(String(req.query.ids || "").split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 80);
  if (!branchId || ids.length === 0) {
    return sendSuccess(res, [], "Savat qoldig'i");
  }
  const rows = await prisma.branchStock.findMany({
    where: { branchId, medicineId: { in: ids } },
    select: { medicineId: true, price: true, stockCount: true, reservedCount: true },
  });
  const byId = new Map(rows.map((row) => [row.medicineId, row]));
  return sendSuccess(
    res,
    ids.map((id) => {
      const row = byId.get(id);
      return {
        id,
        price: row ? Number(row.price) : null,
        available: row ? availableCount(row) : 0,
      };
    }),
    "Savat qoldig'i"
  );
});

module.exports = {
  listCategories,
  listMedicines,
  getMedicineBySlug,
  getMedicines: listMedicines,
  cartAvailability,
};
