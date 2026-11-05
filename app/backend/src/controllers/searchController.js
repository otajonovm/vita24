const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess, AppError } = require("../lib/response");
const { mapMedicine } = require("./medicineController");
const {
  invalidateSynonymCache,
  rankMedicines,
  markSearchClick,
  popularQueries,
  searchStats,
  fallbackShelf,
} = require("../lib/search");

async function hydrate(ids, branchId, reasons) {
  if (!ids.length) return [];
  const rows = await prisma.medicine.findMany({
    where: { id: { in: ids } },
    include: {
      category: { select: { id: true, name: true, slug: true, icon: true } },
      stocks: {
        where: branchId ? { branchId } : { branch: { isActive: true } },
        select: { branchId: true, price: true, stockCount: true, reservedCount: true },
      },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => {
      const medicine = byId.get(id);
      if (!medicine) return null;
      const mapped = mapMedicine(medicine, branchId);
      const reason = reasons?.get(id);
      if (reason) {
        mapped.matchReason = reason.matchReason;
        mapped.matchGroup = reason.matchGroup;
      }
      return mapped;
    })
    .filter(Boolean);
}

const suggestMedicines = asyncHandler(async (req, res) => {
  const query = String(req.query.q || "").trim();
  const branchId = req.query.branchId || null;
  if (query.length < 2) {
    const [queries, shelf] = await Promise.all([popularQueries(8), fallbackShelf(branchId)]);
    const popular = await hydrate(shelf.popularIds, branchId);
    return sendSuccess(res, { popularQueries: queries, popular, medicines: [], ingredients: [], symptoms: [], suggestions: [] });
  }

  const ranked = await rankMedicines({
    query,
    branchId,
    limit: 12,
    offset: 0,
    log: false,
    logZero: true,
  });
  const reasons = new Map(ranked.hits.map((hit) => [hit.id, hit]));
  const items = await hydrate(ranked.hits.map((hit) => hit.id), branchId, reasons);

  const medicines = [];
  const ingredients = [];
  const symptoms = [];
  for (const item of items) {
    if (item.matchGroup === "symptom") symptoms.push(item);
    else if (item.matchGroup === "ingredient") ingredients.push(item);
    else medicines.push(item);
  }

  // Agar asosiy guruhda faqat OOS bo'lsa — ingredient analoglarini alohida saqlab qol.
  const medicineHasStock = medicines.some((item) => Number(item.stockCount) > 0);
  if (!medicineHasStock && ingredients.length === 0) {
    const stocked = items.filter((item) => Number(item.stockCount) > 0 && !medicines.some((row) => row.id === item.id));
    ingredients.push(...stocked.slice(0, 4));
  }

  let popular = [];
  let popularQueryRows = [];
  if (items.length === 0) {
    const [queries, shelf] = await Promise.all([popularQueries(8), fallbackShelf(branchId)]);
    popularQueryRows = queries;
    popular = await hydrate(shelf.popularIds, branchId);
  }

  return sendSuccess(res, {
    medicines: medicines.slice(0, 8),
    ingredients: ingredients.slice(0, 6),
    symptoms: symptoms.slice(0, 6),
    suggestions: ranked.suggestions.map((item) => item.name),
    popularQueries: popularQueryRows,
    popular,
  });
});

const recordSearchClick = asyncHandler(async (req, res) => {
  await markSearchClick({
    query: req.body.query,
    medicineId: req.body.medicineId,
    branchId: req.body.branchId,
  });
  return sendSuccess(res, { ok: true });
});

const getSearchAdmin = asyncHandler(async (req, res) => {
  const [stats, synonyms] = await Promise.all([
    searchStats(),
    prisma.searchSynonym.findMany({ orderBy: [{ type: "asc" }, { term: "asc" }] }),
  ]);
  return sendSuccess(res, { ...stats, synonyms });
});

const createSynonym = asyncHandler(async (req, res) => {
  const created = await prisma.searchSynonym.create({ data: req.body });
  invalidateSynonymCache();
  return sendSuccess(res, created, "Sinonim qo'shildi", 201);
});

const updateSynonym = asyncHandler(async (req, res) => {
  const current = await prisma.searchSynonym.findUnique({ where: { id: req.params.id } });
  if (!current) throw new AppError("Sinonim topilmadi", 404, "NOT_FOUND");
  const updated = await prisma.searchSynonym.update({ where: { id: current.id }, data: req.body });
  invalidateSynonymCache();
  return sendSuccess(res, updated, "Sinonim saqlandi");
});

const deleteSynonym = asyncHandler(async (req, res) => {
  const current = await prisma.searchSynonym.findUnique({ where: { id: req.params.id } });
  if (!current) throw new AppError("Sinonim topilmadi", 404, "NOT_FOUND");
  await prisma.searchSynonym.delete({ where: { id: current.id } });
  invalidateSynonymCache();
  return sendSuccess(res, { id: current.id }, "Sinonim o'chirildi");
});

module.exports = {
  suggestMedicines,
  recordSearchClick,
  getSearchAdmin,
  createSynonym,
  updateSynonym,
  deleteSynonym,
  hydrate,
};
