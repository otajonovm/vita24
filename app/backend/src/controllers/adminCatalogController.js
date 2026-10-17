const ExcelJS = require("exceljs");
const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { runDbTransaction } = require("../lib/transaction");
const { writeAudit } = require("../lib/audit");
const { slugify } = require("../lib/branchProfile");
const { toCsv, toXlsx } = require("../lib/reportFile");
const { EXPORT_HEADERS, parseCsv, rowsFromMatrix, classifyRows } = require("../lib/catalogImport");

const medicineSelect = {
  id: true,
  name: true,
  slug: true,
  manufacturer: true,
  dosageForm: true,
  dosage: true,
  activeIngredient: true,
  quantityInPack: true,
  isPrescription: true,
  isActive: true,
  barcode: true,
  usage: true,
  contraindications: true,
  storageConditions: true,
  basePrice: true,
  imageUrl: true,
  description: true,
  categoryId: true,
  category: { select: { id: true, name: true, slug: true } },
};

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function medicineAudit(row) {
  return {
    name: row.name,
    basePrice: money(row.basePrice),
    isActive: row.isActive,
    isPrescription: row.isPrescription,
    categoryId: row.categoryId,
    barcode: row.barcode,
    manufacturer: row.manufacturer,
    dosage: row.dosage,
    dosageForm: row.dosageForm,
  };
}

function serializeMedicine(medicine) {
  return {
    ...medicine,
    basePrice: money(medicine.basePrice),
    dosage: medicine.dosage || "",
    activeIngredient: medicine.activeIngredient || "",
    barcode: medicine.barcode || "",
    usage: medicine.usage || "",
    contraindications: medicine.contraindications || "",
    storageConditions: medicine.storageConditions || "",
    imageUrl: medicine.imageUrl || null,
    quantityInPack: medicine.quantityInPack || 1,
  };
}

async function uniqueSlug(name, ignoreId) {
  const base = slugify(name) || "dori";
  let slug = base;
  let suffix = 2;
  while (true) {
    const found = await prisma.medicine.findUnique({ where: { slug }, select: { id: true } });
    if (!found || found.id === ignoreId) return slug;
    slug = `${base}-${suffix}`.slice(0, 64);
    suffix += 1;
  }
}

async function assertBarcodeFree(barcode, ignoreId) {
  if (!barcode) return;
  const found = await prisma.medicine.findFirst({
    where: { barcode, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true, name: true },
  });
  if (found) {
    throw new AppError(`Shtrix-kod ${found.name} dorisida band`, 409, "CONFLICT");
  }
}

function medicineData(body, extra = {}) {
  return {
    name: body.name.trim(),
    activeIngredient: String(body.activeIngredient || "").trim() || null,
    dosage: String(body.dosage || "").trim() || null,
    dosageForm: body.dosageForm.trim(),
    quantityInPack: body.quantityInPack,
    manufacturer: body.manufacturer.trim(),
    categoryId: body.categoryId,
    isPrescription: body.isPrescription === true,
    barcode: String(body.barcode || "").trim() || null,
    usage: String(body.usage || "").trim() || null,
    contraindications: String(body.contraindications || "").trim() || null,
    storageConditions: String(body.storageConditions || "").trim() || null,
    description: String(body.usage || body.description || body.name).trim() || body.name.trim(),
    basePrice: money(body.basePrice),
    ...extra,
  };
}

const listCatalog = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const categoryId = String(req.query.categoryId || "").trim();
  const active = String(req.query.active || "all");
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const where = {
    ...(categoryId ? { categoryId } : {}),
    ...(active === "active" ? { isActive: true } : {}),
    ...(active === "inactive" ? { isActive: false } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { manufacturer: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
            { activeIngredient: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.medicine.count({ where }),
    prisma.medicine.findMany({
      where,
      select: medicineSelect,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return sendSuccess(res, { items: rows.map(serializeMedicine), page, limit, total }, "Katalog");
});

const createMedicine = asyncHandler(async (req, res) => {
  const category = await prisma.category.findUnique({ where: { id: req.body.categoryId }, select: { id: true } });
  if (!category) throw new AppError("Kategoriya topilmadi", 404, "NOT_FOUND");
  await assertBarcodeFree(String(req.body.barcode || "").trim());
  const created = await prisma.medicine.create({
    data: {
      ...medicineData(req.body),
      slug: await uniqueSlug(req.body.name),
      imageEmoji: "💊",
      isActive: true,
    },
    select: medicineSelect,
  });
  await writeAudit(prisma, {
    req,
    action: "MEDICINE_CREATED",
    entityType: "Medicine",
    entityId: created.id,
    summary: created.name,
    after: medicineAudit(created),
  });
  return sendSuccess(res, serializeMedicine(created), "Dori qo'shildi", 201);
});

const updateMedicine = asyncHandler(async (req, res) => {
  const current = await prisma.medicine.findUnique({ where: { id: req.params.id }, select: medicineSelect });
  if (!current) throw new AppError("Dori topilmadi", 404, "NOT_FOUND");
  if (req.body.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: req.body.categoryId }, select: { id: true } });
    if (!category) throw new AppError("Kategoriya topilmadi", 404, "NOT_FOUND");
  }
  await assertBarcodeFree(String(req.body.barcode || "").trim(), current.id);
  const data = medicineData(req.body);
  if (req.body.name && req.body.name.trim() !== current.name) data.slug = await uniqueSlug(req.body.name, current.id);
  const updated = await prisma.medicine.update({ where: { id: current.id }, data, select: medicineSelect });
  await writeAudit(prisma, {
    req,
    action: "MEDICINE_UPDATED",
    entityType: "Medicine",
    entityId: updated.id,
    summary: updated.name,
    before: medicineAudit(current),
    after: medicineAudit(updated),
  });
  return sendSuccess(res, serializeMedicine(updated), "Dori saqlandi");
});

const setMedicineActive = asyncHandler(async (req, res) => {
  const current = await prisma.medicine.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!current) throw new AppError("Dori topilmadi", 404, "NOT_FOUND");
  const updated = await prisma.medicine.update({
    where: { id: current.id },
    data: { isActive: req.body.isActive === true },
    select: medicineSelect,
  });
  await writeAudit(prisma, {
    req,
    action: updated.isActive ? "MEDICINE_ACTIVATED" : "MEDICINE_DEACTIVATED",
    entityType: "Medicine",
    entityId: current.id,
    summary: current.name,
    before: { isActive: !updated.isActive },
    after: { isActive: updated.isActive },
  });
  return sendSuccess(res, serializeMedicine(updated), updated.isActive ? "Dori faollashtirildi" : "Dori nofaol qilindi");
});

const listAdminCategories = asyncHandler(async (_req, res) => {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { medicines: true } } },
  });
  return sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      sortOrder: row.sortOrder,
      medicineCount: row._count.medicines,
    })),
    "Kategoriyalar"
  );
});

const createCategory = asyncHandler(async (req, res) => {
  const name = req.body.name.trim();
  const slug = await uniqueCategorySlug(name);
  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.category.create({
    data: {
      name,
      slug,
      icon: req.body.icon || "pill",
      sortOrder: req.body.sortOrder ?? (max._max.sortOrder || 0) + 1,
    },
  });
  await writeAudit(prisma, {
    req,
    action: "CATEGORY_CREATED",
    entityType: "Category",
    entityId: created.id,
    summary: created.name,
    after: { name: created.name, icon: created.icon, sortOrder: created.sortOrder },
  });
  return sendSuccess(res, created, "Kategoriya qo'shildi", 201);
});

async function uniqueCategorySlug(name, ignoreId) {
  const base = slugify(name) || "kategoriya";
  let slug = base;
  let suffix = 2;
  while (true) {
    const found = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
    if (!found || found.id === ignoreId) return slug;
    slug = `${base}-${suffix}`.slice(0, 64);
    suffix += 1;
  }
}

const updateCategory = asyncHandler(async (req, res) => {
  const current = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!current) throw new AppError("Kategoriya topilmadi", 404, "NOT_FOUND");
  const data = {};
  if (req.body.name != null) {
    data.name = req.body.name.trim();
    if (data.name !== current.name) data.slug = await uniqueCategorySlug(data.name, current.id);
  }
  if (req.body.icon != null) data.icon = req.body.icon;
  if (req.body.sortOrder != null) data.sortOrder = req.body.sortOrder;
  const updated = await prisma.category.update({ where: { id: current.id }, data });
  await writeAudit(prisma, {
    req,
    action: "CATEGORY_UPDATED",
    entityType: "Category",
    entityId: updated.id,
    summary: updated.name,
    before: { name: current.name, icon: current.icon, sortOrder: current.sortOrder },
    after: { name: updated.name, icon: updated.icon, sortOrder: updated.sortOrder },
  });
  return sendSuccess(res, updated, "Kategoriya saqlandi");
});

const deleteCategory = asyncHandler(async (req, res) => {
  const current = await prisma.category.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { medicines: true } } },
  });
  if (!current) throw new AppError("Kategoriya topilmadi", 404, "NOT_FOUND");
  if (current._count.medicines > 0) {
    throw new AppError("Dorisi bor kategoriyani o'chirib bo'lmaydi", 409, "CONFLICT");
  }
  await prisma.category.delete({ where: { id: current.id } });
  await writeAudit(prisma, {
    req,
    action: "CATEGORY_DELETED",
    entityType: "Category",
    entityId: current.id,
    summary: current.name,
    before: { name: current.name },
    after: { deleted: true },
  });
  return sendSuccess(res, { id: current.id }, "Kategoriya o'chirildi");
});

async function importContext() {
  const [categories, medicines] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.medicine.findMany({ select: { id: true, name: true, barcode: true } }),
  ]);
  return {
    categories: new Map(categories.map((item) => [item.name.toLowerCase(), item.id])),
    medicinesByBarcode: new Map(medicines.filter((item) => item.barcode).map((item) => [item.barcode, item])),
    medicinesByName: new Map(medicines.map((item) => [item.name.toLowerCase(), item])),
  };
}

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.text) return String(value.text);
    if (value.result != null) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  }
  return value;
}

async function matrixFromUpload(file) {
  if (!file) throw new AppError("CSV yoki Excel faylini yuklang", 400, "VALIDATION_ERROR");
  const name = String(file.originalname || "").toLowerCase();
  if (name.endsWith(".csv") || file.mimetype === "text/csv") {
    return rowsFromMatrix(parseCsv(file.buffer.toString("utf8")));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], error: "Fayl bo'sh" };
  const matrix = [];
  sheet.eachRow((row) => {
    matrix.push(row.values.slice(1).map(cellText));
  });
  return rowsFromMatrix(matrix);
}

const previewImport = asyncHandler(async (req, res) => {
  const parsed = await matrixFromUpload(req.file);
  if (parsed.error) throw new AppError(parsed.error, 400, "VALIDATION_ERROR");
  if (parsed.rows.length > 2000) throw new AppError("Bir safar 2000 qatordan ko'p yuklab bo'lmaydi", 400, "VALIDATION_ERROR");
  const result = classifyRows(parsed.rows, await importContext());
  return sendSuccess(res, result, "Import tekshiruvi");
});

const confirmImport = asyncHandler(async (req, res) => {
  const incoming = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 2000) : [];
  if (!incoming.length) throw new AppError("Tasdiqlash uchun qator yo'q", 400, "VALIDATION_ERROR");
  const context = await importContext();
  const classified = classifyRows(
    incoming.map((row, index) => ({ line: row.line || index + 2, raw: row })),
    context
  );
  const ready = classified.rows.filter((row) => row.ok);
  if (!ready.length) throw new AppError("To'g'ri qator yo'q", 400, "VALIDATION_ERROR");

  const saved = await runDbTransaction(prisma, async (tx) => {
    let created = 0;
    let updated = 0;
    const usedSlugs = new Set();
    async function nextSlug(name) {
      const base = slugify(name) || "dori";
      let slug = base;
      let suffix = 2;
      while (usedSlugs.has(slug) || (await tx.medicine.findUnique({ where: { slug }, select: { id: true } }))) {
        slug = `${base}-${suffix}`.slice(0, 64);
        suffix += 1;
      }
      usedSlugs.add(slug);
      return slug;
    }
    for (const row of ready) {
      const data = {
        name: row.data.name,
        activeIngredient: row.data.activeIngredient || null,
        dosage: row.data.dosage || null,
        dosageForm: row.data.dosageForm,
        quantityInPack: row.data.quantityInPack,
        manufacturer: row.data.manufacturer,
        categoryId: row.data.categoryId,
        isPrescription: row.data.isPrescription,
        barcode: row.data.barcode || null,
        usage: row.data.usage || null,
        contraindications: row.data.contraindications || null,
        storageConditions: row.data.storageConditions || null,
        description: row.data.usage || row.data.name,
        basePrice: row.data.basePrice,
      };
      if (row.action === "update" && row.medicineId) {
        await tx.medicine.update({ where: { id: row.medicineId }, data });
        updated += 1;
      } else {
        await tx.medicine.create({
          data: { ...data, slug: await nextSlug(row.data.name), imageEmoji: "💊", isActive: true },
        });
        created += 1;
      }
    }
    await writeAudit(tx, {
      req,
      action: "MEDICINE_IMPORT",
      entityType: "Medicine",
      entityId: "import",
      summary: `${created} ta yangi, ${updated} ta yangilandi, ${classified.errorCount} ta xato tashlab ketildi`,
      after: { created, updated, skipped: classified.errorCount },
    });
    return { created, updated, skipped: classified.errorCount };
  });
  return sendSuccess(res, saved, "Import tasdiqlandi");
});

const exportCatalog = asyncHandler(async (req, res) => {
  const rows = await prisma.medicine.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      activeIngredient: true,
      dosage: true,
      dosageForm: true,
      quantityInPack: true,
      manufacturer: true,
      isPrescription: true,
      barcode: true,
      usage: true,
      contraindications: true,
      storageConditions: true,
      basePrice: true,
      category: { select: { name: true } },
    },
  });
  const table = rows.map((row) => {
    const record = {};
    for (const [header, key] of EXPORT_HEADERS) {
      if (key === "category") record[header] = row.category?.name || "";
      else if (key === "isPrescription") record[header] = row.isPrescription ? "ha" : "yo'q";
      else if (key === "basePrice") record[header] = money(row.basePrice);
      else record[header] = row[key] ?? "";
    }
    return record;
  });
  const format = req.query.format === "csv" ? "csv" : "xlsx";
  const body = format === "csv" ? toCsv(table) : await toXlsx(table);
  res.setHeader("Content-Type", format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="dorilar.${format}"`);
  return res.send(body);
});

module.exports = {
  listCatalog,
  createMedicine,
  updateMedicine,
  setMedicineActive,
  listAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  previewImport,
  confirmImport,
  exportCatalog,
};
