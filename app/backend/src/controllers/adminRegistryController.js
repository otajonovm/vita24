const { z } = require("zod");
const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { writeAudit } = require("../lib/audit");
const { searchDrugs } = require("../services/mpaClient");
const { normalizeDrugText, scoreMedicineAgainstRegistry } = require("../lib/drugMatch");
const { pickPreferredImage, processAndStoreRegistryImage } = require("../lib/mpaImageProcess");
const { downloadDrugImage } = require("../services/mpaClient");
const { removeMedicineImageByUrl } = require("../middlewares/upload");
const { publicImageUrl } = require("../lib/medicineImage");

const listQuerySchema = z
  .object({
    tab: z.enum(["matches", "images", "all"]).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

const getStats = asyncHandler(async (_req, res) => {
  const [
    rxTrue,
    rxFalse,
    needsReview,
    unmatched,
    noImage,
    pendingImages,
    confirmedMatches,
    reviewMatches,
  ] = await Promise.all([
    prisma.medicine.count({ where: { isPrescription: true } }),
    prisma.medicine.count({ where: { isPrescription: false } }),
    prisma.medicine.count({ where: { rxNeedsReview: true } }),
    prisma.medicine.count({ where: { matchStatus: { in: ["NONE", "REJECTED"] } } }),
    prisma.medicine.count({
      where: {
        OR: [
          { imageUrl: null },
          { imageUrl: "" },
          { imageSource: "NONE" },
          { AND: [{ imageSource: "REGISTRY" }, { imageStatus: { not: "APPROVED" } }] },
        ],
      },
    }),
    prisma.medicine.count({ where: { imageSource: "REGISTRY", imageStatus: "PENDING" } }),
    prisma.medicine.count({ where: { matchStatus: { in: ["AUTO", "CONFIRMED"] } } }),
    prisma.medicine.count({ where: { matchStatus: "REVIEW" } }),
  ]);

  return sendSuccess(res, {
    rxTrue,
    rxFalse,
    needsReview,
    unmatched,
    noImage,
    pendingImages,
    confirmedMatches,
    reviewMatches,
    registryCount: await prisma.registryDrug.count(),
  });
});

function serializeReviewRow(row) {
  return {
    id: row.id,
    name: row.name,
    dosageForm: row.dosageForm,
    dosage: row.dosage || "",
    manufacturer: row.manufacturer,
    activeIngredient: row.activeIngredient || "",
    isPrescription: row.isPrescription,
    rxSource: row.rxSource,
    rxNeedsReview: row.rxNeedsReview,
    matchScore: row.matchScore,
    matchStatus: row.matchStatus,
    imageUrl: row.imageUrl || null,
    publicImageUrl: publicImageUrl(row),
    imageSource: row.imageSource,
    imageStatus: row.imageStatus,
    registryImageCandidates: row.registryImageCandidates || [],
    registryDrug: row.registryDrug
      ? {
          id: row.registryDrug.id,
          mpaId: row.registryDrug.mpaId,
          shortName: row.registryDrug.shortName,
          fullName: row.registryDrug.fullName,
          mnn: row.registryDrug.mnn,
          dosageForm: row.registryDrug.dosageForm,
          strength: row.registryDrug.strength,
          manufacturer: row.registryDrug.manufacturer,
          isPrescription: row.registryDrug.isPrescription,
          dispensingConditions: row.registryDrug.dispensingConditions,
          imgUrls: row.registryDrug.imgUrls || [],
        }
      : null,
  };
}

const listReview = asyncHandler(async (req, res) => {
  const tab = String(req.query.tab || "matches");
  const search = String(req.query.search || "").trim();
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const and = [];

  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { activeIngredient: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (tab === "matches") {
    and.push({
      OR: [{ matchStatus: "REVIEW" }, { rxNeedsReview: true, matchStatus: { notIn: ["CONFIRMED", "REJECTED"] } }],
    });
  } else if (tab === "images") {
    and.push({ imageSource: "REGISTRY", imageStatus: "PENDING" });
  }

  const where = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.medicine.count({ where }),
    prisma.medicine.findMany({
      where,
      orderBy: [{ matchScore: "desc" }, { name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        dosageForm: true,
        dosage: true,
        manufacturer: true,
        activeIngredient: true,
        isPrescription: true,
        rxSource: true,
        rxNeedsReview: true,
        matchScore: true,
        matchStatus: true,
        imageUrl: true,
        imageSource: true,
        imageStatus: true,
        registryImageCandidates: true,
        registryDrug: true,
      },
    }),
  ]);

  return sendSuccess(res, {
    items: rows.map(serializeReviewRow),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

const searchRegistry = asyncHandler(async (req, res) => {
  const q = String(req.query.q || req.query.name || "").trim();
  if (!q) throw new AppError("Qidiruv matni majburiy", 400, "VALIDATION_ERROR");

  let remote = [];
  try {
    const result = await searchDrugs({ name: q, page: 0, size: 20 });
    remote = result.items;
    for (const row of remote) {
      if (!row.mpaId) continue;
      await prisma.registryDrug.upsert({
        where: { mpaId: row.mpaId },
        create: {
          mpaId: row.mpaId,
          shortName: row.shortName || row.fullName,
          fullName: row.fullName || row.shortName,
          mnn: row.mnn,
          dosageForm: row.dosageForm,
          strength: row.strength,
          manufacturer: row.manufacturer,
          country: row.country,
          registrationCode: row.registrationCode,
          atxCode: row.atxCode,
          isPrescription: Boolean(row.isPrescription),
          dispensingConditions: row.dispensingConditions,
          imgUrls: row.imgUrls,
          normalizedName: normalizeDrugText(row.shortName || row.fullName),
          fetchedAt: new Date(),
        },
        update: {
          shortName: row.shortName || row.fullName,
          fullName: row.fullName || row.shortName,
          mnn: row.mnn,
          dosageForm: row.dosageForm,
          strength: row.strength,
          manufacturer: row.manufacturer,
          isPrescription: Boolean(row.isPrescription),
          dispensingConditions: row.dispensingConditions,
          imgUrls: row.imgUrls,
          normalizedName: normalizeDrugText(row.shortName || row.fullName),
          fetchedAt: new Date(),
        },
      });
    }
  } catch {
    remote = [];
  }

  const local = await prisma.registryDrug.findMany({
    where: {
      OR: [
        { shortName: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
        { mnn: { contains: q, mode: "insensitive" } },
        { normalizedName: { contains: normalizeDrugText(q), mode: "insensitive" } },
      ],
    },
    take: 30,
    orderBy: { shortName: "asc" },
  });

  return sendSuccess(res, { local, remote });
});

async function applyRegistryLink(medicineId, registryDrugId, { confirm, reject }) {
  const medicine = await prisma.medicine.findUnique({
    where: { id: medicineId },
    select: {
      id: true,
      name: true,
      rxSource: true,
      isPrescription: true,
      rxNeedsReview: true,
      registryDrugId: true,
      matchStatus: true,
    },
  });
  if (!medicine) throw new AppError("Dori topilmadi", 404, "NOT_FOUND");

  if (reject) {
    return prisma.medicine.update({
      where: { id: medicine.id },
      data: {
        registryDrugId: null,
        matchStatus: "REJECTED",
        matchScore: null,
        isPrescription: medicine.rxSource === "MANUAL" ? medicine.isPrescription : true,
        rxSource: medicine.rxSource === "MANUAL" ? "MANUAL" : "DEFAULT",
        rxNeedsReview: medicine.rxSource === "MANUAL" ? false : true,
      },
      include: { registryDrug: true },
    });
  }

  const registry = await prisma.registryDrug.findUnique({ where: { id: registryDrugId } });
  if (!registry) throw new AppError("MPA yozuvi topilmadi", 404, "NOT_FOUND");

  const score = scoreMedicineAgainstRegistry(medicine, registry);
  const data = {
    registryDrugId: registry.id,
    matchStatus: confirm ? "CONFIRMED" : "AUTO",
    matchScore: score,
  };
  if (medicine.rxSource !== "MANUAL") {
    data.isPrescription = Boolean(registry.isPrescription);
    data.rxSource = "REGISTRY";
    data.rxNeedsReview = false;
  }

  return prisma.medicine.update({
    where: { id: medicine.id },
    data,
    include: { registryDrug: true },
  });
}

const confirmMatch = asyncHandler(async (req, res) => {
  const registryDrugId = String(req.body.registryDrugId || "").trim();
  if (!registryDrugId) throw new AppError("registryDrugId majburiy", 400, "VALIDATION_ERROR");
  const updated = await applyRegistryLink(req.params.id, registryDrugId, { confirm: true });
  await writeAudit(prisma, {
    req,
    action: "REGISTRY_MATCH_CONFIRM",
    entityType: "Medicine",
    entityId: updated.id,
    summary: `${updated.name} → MPA ${updated.registryDrug?.mpaId || ""}`,
  });
  return sendSuccess(res, serializeReviewRow(updated), "Moslashuv tasdiqlandi");
});

const rejectMatch = asyncHandler(async (req, res) => {
  const updated = await applyRegistryLink(req.params.id, null, { reject: true });
  await writeAudit(prisma, {
    req,
    action: "REGISTRY_MATCH_REJECT",
    entityType: "Medicine",
    entityId: updated.id,
    summary: `${updated.name}: moslashuv rad etildi`,
  });
  return sendSuccess(res, serializeReviewRow(updated), "Moslashuv rad etildi");
});

const setMatch = asyncHandler(async (req, res) => {
  const registryDrugId = String(req.body.registryDrugId || "").trim();
  if (!registryDrugId) throw new AppError("registryDrugId majburiy", 400, "VALIDATION_ERROR");
  const updated = await applyRegistryLink(req.params.id, registryDrugId, { confirm: true });
  await writeAudit(prisma, {
    req,
    action: "REGISTRY_MATCH_SET",
    entityType: "Medicine",
    entityId: updated.id,
    summary: `${updated.name}: MPA tanlandi ${updated.registryDrug?.mpaId || ""}`,
  });
  return sendSuccess(res, serializeReviewRow(updated), "MPA yozuvi biriktirildi");
});

const decideImage = asyncHandler(async (req, res) => {
  const action = String(req.body.action || "").toLowerCase();
  const medicine = await prisma.medicine.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      imageSource: true,
      imageStatus: true,
      registryImageCandidates: true,
      registryDrug: true,
    },
  });
  if (!medicine) throw new AppError("Dori topilmadi", 404, "NOT_FOUND");
  if (medicine.imageSource === "MANUAL") {
    throw new AppError("MANUAL rasm o'zgartirilmaydi — avval yangi rasm yuklang", 409, "MANUAL_IMAGE");
  }

  if (action === "approve") {
    const updated = await prisma.medicine.update({
      where: { id: medicine.id },
      data: { imageStatus: "APPROVED", imageSource: "REGISTRY" },
      include: { registryDrug: true },
    });
    await writeAudit(prisma, {
      req,
      action: "REGISTRY_IMAGE_APPROVE",
      entityType: "Medicine",
      entityId: medicine.id,
      summary: `${medicine.name}: MPA rasm tasdiqlandi`,
    });
    return sendSuccess(res, serializeReviewRow(updated), "Rasm tasdiqlandi");
  }

  if (action === "reject") {
    const previous = medicine.imageUrl;
    const updated = await prisma.medicine.update({
      where: { id: medicine.id },
      data: {
        imageStatus: "REJECTED",
        imageSource: "NONE",
        imageUrl: null,
      },
      include: { registryDrug: true },
    });
    if (previous) removeMedicineImageByUrl(previous);
    await writeAudit(prisma, {
      req,
      action: "REGISTRY_IMAGE_REJECT",
      entityType: "Medicine",
      entityId: medicine.id,
      summary: `${medicine.name}: MPA rasm rad etildi`,
    });
    return sendSuccess(res, serializeReviewRow(updated), "Rasm rad etildi");
  }

  if (action === "select-side") {
    const side = String(req.body.side || "").trim();
    const url = String(req.body.url || "").trim();
    const candidates = Array.isArray(medicine.registryImageCandidates)
      ? medicine.registryImageCandidates
      : medicine.registryDrug?.imgUrls || [];
    const chosen =
      candidates.find((item) => (url && item.url === url) || (side && String(item.side) === side)) ||
      pickPreferredImage(candidates);
    if (!chosen?.url) throw new AppError("Rasm nomzodi topilmadi", 404, "NOT_FOUND");

    const file = await downloadDrugImage(chosen.url);
    const stored = await processAndStoreRegistryImage(medicine.id, file.buffer, file.contentType);
    if (medicine.imageUrl) removeMedicineImageByUrl(medicine.imageUrl);
    const updated = await prisma.medicine.update({
      where: { id: medicine.id },
      data: {
        imageUrl: stored.imageUrl,
        imageSource: "REGISTRY",
        imageStatus: "PENDING",
        registryImageCandidates: candidates.map((item) => ({
          ...item,
          selected: item.url === chosen.url,
        })),
      },
      include: { registryDrug: true },
    });
    return sendSuccess(res, serializeReviewRow(updated), "Boshqa tomon rasmi tanlandi");
  }

  throw new AppError("action: approve | reject | select-side", 400, "VALIDATION_ERROR");
});

const bulkDecideImages = asyncHandler(async (req, res) => {
  const action = String(req.body.action || "").toLowerCase();
  const ids = [...new Set((req.body.ids || []).map((id) => String(id)))];
  if (!ids.length) throw new AppError("ids majburiy", 400, "VALIDATION_ERROR");
  if (action !== "approve" && action !== "reject") {
    throw new AppError("action: approve | reject", 400, "VALIDATION_ERROR");
  }

  let updated = 0;
  for (const id of ids) {
    const medicine = await prisma.medicine.findUnique({
      where: { id },
      select: { id: true, name: true, imageUrl: true, imageSource: true, imageStatus: true },
    });
    if (!medicine || medicine.imageSource === "MANUAL") continue;
    if (medicine.imageSource !== "REGISTRY" || medicine.imageStatus !== "PENDING") continue;

    if (action === "approve") {
      await prisma.medicine.update({
        where: { id },
        data: { imageStatus: "APPROVED" },
      });
    } else {
      const previous = medicine.imageUrl;
      await prisma.medicine.update({
        where: { id },
        data: { imageStatus: "REJECTED", imageSource: "NONE", imageUrl: null },
      });
      if (previous) removeMedicineImageByUrl(previous);
    }
    updated += 1;
  }

  await writeAudit(prisma, {
    req,
    action: action === "approve" ? "REGISTRY_IMAGE_BULK_APPROVE" : "REGISTRY_IMAGE_BULK_REJECT",
    entityType: "Medicine",
    entityId: "bulk",
    summary: `${updated} ta rasm ${action}`,
  });

  return sendSuccess(res, { updated, action }, "Ommaviy amal bajarildi");
});

module.exports = {
  listQuerySchema,
  getStats,
  listReview,
  searchRegistry,
  confirmMatch,
  rejectMatch,
  setMatch,
  decideImage,
  bulkDecideImages,
};
