const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess, AppError } = require("../lib/response");
const { availableCount } = require("../lib/stock");

function mapMedicine(medicine, branchId) {
  const stock = branchId
    ? medicine.stocks.find((item) => item.branchId === branchId) || null
    : medicine.stocks[0] || null;

  return {
    id: medicine.id,
    name: medicine.name,
    slug: medicine.slug,
    description: medicine.description,
    manufacturer: medicine.manufacturer,
    dosageForm: medicine.dosageForm,
    isPrescription: medicine.isPrescription,
    imageEmoji: medicine.imageEmoji,
    externalApiId: medicine.externalApiId,
    category: medicine.category,
    price: stock ? Number(stock.price) : null,
    stockCount: stock?.stockCount ?? 0,
    reservedCount: stock?.reservedCount ?? 0,
    available: availableCount(stock),
  };
}

const listCategories = asyncHandler(async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      sortOrder: true,
      _count: { select: { medicines: true } },
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

const listMedicines = asyncHandler(async (req, res) => {
  const { branchId, categoryId, search } = req.query;

  if (!branchId) {
    throw new AppError("branchId so'rov parametri majburiy", 400, "VALIDATION_ERROR");
  }

  const branch = await prisma.branch.findFirst({
    where: { id: String(branchId), isActive: true },
    select: { id: true },
  });

  if (!branch) {
    throw new AppError("Filial topilmadi yoki faol emas", 404, "NOT_FOUND");
  }

  const medicines = await prisma.medicine.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { name: { contains: String(search) } },
              { description: { contains: String(search) } },
              { manufacturer: { contains: String(search) } },
            ],
          }
        : {}),
      ...(categoryId ? { categoryId: String(categoryId) } : {}),
    },
    include: {
      category: {
        select: { id: true, name: true, slug: true, icon: true },
      },
      stocks: { where: { branchId: String(branchId) } },
    },
    orderBy: { name: "asc" },
  });

  return sendSuccess(
    res,
    medicines.map((medicine) => mapMedicine(medicine, String(branchId))),
    "Dorilar katalogi"
  );
});

module.exports = {
  listCategories,
  listMedicines,
};
