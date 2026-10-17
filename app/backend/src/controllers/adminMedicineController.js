const prisma = require("../lib/prisma");
const { writeAudit } = require("../lib/audit");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { SHOWCASE_LIMIT, showcaseOrderError } = require("../lib/showcase");
const {
  MEDICINE_UPLOAD_URL,
  removeUploadedFile,
  removeMedicineImageByUrl,
} = require("../middlewares/upload");

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const updateMedicineImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Rasm fayli majburiy (maydon nomi: image)", 400, "VALIDATION_ERROR");
  }

  const medicine = await prisma.medicine.findUnique({
    where: { id: req.params.id },
    select: { id: true, imageUrl: true },
  });

  if (!medicine) {
    removeUploadedFile(req.file.path);
    throw new AppError("Dori topilmadi", 404, "NOT_FOUND");
  }

  const imageUrl = `${MEDICINE_UPLOAD_URL}/${req.file.filename}`;

  let updated;
  try {
    updated = await prisma.medicine.update({
      where: { id: medicine.id },
      data: { imageUrl },
      select: { id: true, name: true, imageUrl: true },
    });
  } catch (error) {
    removeUploadedFile(req.file.path);
    throw error;
  }

  if (medicine.imageUrl && medicine.imageUrl !== imageUrl) {
    removeMedicineImageByUrl(medicine.imageUrl);
  }

  return sendSuccess(
    res,
    { medicineId: updated.id, name: updated.name, imageUrl: updated.imageUrl },
    "Dori rasmi yangilandi"
  );
});

const setMedicineHome = asyncHandler(async (req, res) => {
  const showOnHome = req.body.showOnHome === true;
  const existing = await prisma.medicine.findUnique({
    where: { id: req.params.id },
    select: { id: true, showOnHome: true },
  });

  if (!existing) {
    throw new AppError("Dori topilmadi", 404, "NOT_FOUND");
  }

  const data = { showOnHome };
  if (showOnHome && !existing.showOnHome) {
    const count = await prisma.medicine.count({ where: { showOnHome: true } });
    if (count >= SHOWCASE_LIMIT) {
      throw new AppError(`Vitrinada ko'pi bilan ${SHOWCASE_LIMIT} ta dori bo'ladi`, 409, "SHOWCASE_FULL");
    }
    const max = await prisma.medicine.aggregate({
      where: { showOnHome: true },
      _max: { homeSortOrder: true },
    });
    data.homeSortOrder = (max._max.homeSortOrder || 0) + 1;
  }
  if (!showOnHome) data.homeSortOrder = 0;

  const updated = await prisma.medicine.update({
    where: { id: existing.id },
    data,
    select: { id: true, name: true, showOnHome: true, homeSortOrder: true },
  });

  await writeAudit(prisma, {
    req,
    action: showOnHome ? "SHOWCASE_ADDED" : "SHOWCASE_REMOVED",
    entityType: "Medicine",
    entityId: updated.id,
    summary: updated.name,
    before: { showOnHome: existing.showOnHome },
    after: { showOnHome: updated.showOnHome, homeSortOrder: updated.homeSortOrder },
  });

  return sendSuccess(
    res,
    {
      medicineId: updated.id,
      name: updated.name,
      showOnHome: updated.showOnHome,
      homeSortOrder: updated.homeSortOrder,
    },
    showOnHome ? "Dori bosh sahifaga qo'yildi" : "Dori bosh sahifadan olindi"
  );
});

const listShowcase = asyncHandler(async (req, res) => {
  const branchId = String(req.query.branchId || "").trim();
  const rows = await prisma.medicine.findMany({
    where: { showOnHome: true },
    orderBy: [{ homeSortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      dosage: true,
      dosageForm: true,
      manufacturer: true,
      imageUrl: true,
      isPrescription: true,
      isActive: true,
      basePrice: true,
      homeSortOrder: true,
      category: { select: { name: true } },
      ...(branchId
        ? {
            stocks: {
              where: { branchId },
              select: { price: true, stockCount: true },
            },
          }
        : {}),
    },
  });

  const items = rows.map((row) => {
    const stock = row.stocks?.[0] || null;
    return {
      id: row.id,
      name: row.name,
      dosage: row.dosage || row.dosageForm || "",
      manufacturer: row.manufacturer,
      imageUrl: row.imageUrl || null,
      isPrescription: row.isPrescription,
      isActive: row.isActive,
      basePrice: money(row.basePrice),
      price: stock ? money(stock.price) : null,
      stockCount: stock ? stock.stockCount : null,
      homeSortOrder: row.homeSortOrder,
      categoryName: row.category?.name || "",
    };
  });

  return sendSuccess(res, { items, total: items.length, limit: SHOWCASE_LIMIT }, "Vitrina");
});

const reorderShowcase = asyncHandler(async (req, res) => {
  const ids = req.body.ids;
  const current = await prisma.medicine.findMany({
    where: { showOnHome: true },
    select: { id: true },
  });
  const problem = showcaseOrderError(
    current.map((row) => row.id),
    ids
  );
  if (problem === "limit") {
    throw new AppError(`Vitrinada ko'pi bilan ${SHOWCASE_LIMIT} ta dori bo'ladi`, 409, "SHOWCASE_FULL");
  }
  if (problem) {
    throw new AppError("Vitrina ro'yxati eskirgan. Sahifani yangilang.", 409, "SHOWCASE_STALE");
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.medicine.update({
        where: { id },
        data: { homeSortOrder: index + 1 },
      })
    )
  );

  return sendSuccess(res, { ids }, "Vitrina tartibi saqlandi");
});

module.exports = {
  updateMedicineImage,
  setMedicineHome,
  listShowcase,
  reorderShowcase,
};
