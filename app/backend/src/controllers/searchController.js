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
    limit: 8,
    offset: 0,
    log: false,
  });
  const reasons = new Map(ranked.hits.map((hit) => [hit.id, hit]));
  const items = await hydrate(ranked.hits.map((hit) => hit.id), branchId, reasons);
  return sendSuccess(res, {
    medicines: items.filter((item) => item.matchGroup !== "ingredient" && item.matchGroup !== "symptom"),
    ingredients: items.filter((item) => item.matchGroup === "ingredient"),
    symptoms: items.filter((item) => item.matchGroup === "symptom"),
    suggestions: ranked.suggestions.map((item) => item.name),
    popularQueries: [],
    popular: [],
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
