const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { writeAudit } = require("../lib/audit");
const { decryptSecret } = require("../lib/secrets");
const { verifyKey, syncBranchStock } = require("../services/lekkoService");
const {
  readSyncIntervalMinutes,
  saveSyncIntervalMinutes,
  writeSyncResult,
  serializeLog,
} = require("../lib/lekkoSync");

function plainKey(branch) {
  return decryptSecret(branch.lekkoApiKey || "").trim();
}

const lekkoSettings = asyncHandler(async (req, res) => {
  const intervalMinutes = await readSyncIntervalMinutes();
  return sendSuccess(res, { intervalMinutes }, "Lekko sozlamalari");
});

const updateLekkoSettings = asyncHandler(async (req, res) => {
  const previous = await readSyncIntervalMinutes();
  const intervalMinutes = await saveSyncIntervalMinutes(req.body.intervalMinutes);
  require("../workers/stockSyncWorker").rescheduleStockSync();
  await writeAudit(prisma, {
    req,
    action: "LEKKO_INTERVAL",
    entityType: "SystemSetting",
    entityId: "lekko.syncIntervalMin",
    summary: `${intervalMinutes} daqiqa`,
    before: { intervalMinutes: previous },
    after: { intervalMinutes },
  });
  return sendSuccess(res, { intervalMinutes }, "Sinxron oralig'i saqlandi");
});

const listLekkoLogs = asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const where = req.query.branchId ? { branchId: req.query.branchId } : {};
  const [rows, total] = await Promise.all([
    prisma.lekkoSyncLog.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { branch: { select: { name: true } } },
    }),
    prisma.lekkoSyncLog.count({ where }),
  ]);
  return sendSuccess(res, { rows: rows.map(serializeLog), page, limit, total }, "Lekko jurnali");
});

const checkLekkoKey = asyncHandler(async (req, res) => {
  const branch = await prisma.branch.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, lekkoApiKey: true, lekkoDrugStoreId: true },
  });
  if (!branch) throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  const apiKey = plainKey(branch);
  if (!apiKey) throw new AppError("Filial uchun LEKKO API kaliti biriktirilmagan", 400, "LEKKO_KEY_MISSING");

  try {
    const store = await verifyKey(apiKey);
    if (store.drugStoreId && store.drugStoreId !== branch.lekkoDrugStoreId) {
      await prisma.branch.update({
        where: { id: branch.id },
        data: { lekkoDrugStoreId: store.drugStoreId },
      });
    }
    await writeAudit(prisma, {
      req,
      action: "LEKKO_KEY_CHECK",
      entityType: "Branch",
      entityId: branch.id,
      branchId: branch.id,
      summary: `${branch.name}: kalit ishlayapti`,
      after: { ok: true, drugStoreId: store.drugStoreId || null },
    });
    return sendSuccess(
      res,
      { ok: true, drugStoreId: store.drugStoreId, name: store.name || branch.name },
      "Kalit ishlayapti"
    );
  } catch (error) {
    const message = String(error.message || "Kalit tekshiruvi muvaffaqiyatsiz").slice(0, 500);
    await prisma.branch.update({
      where: { id: branch.id },
      data: { lekkoLastError: message, lekkoLastErrorAt: new Date() },
    });
    await writeAudit(prisma, {
      req,
      action: "LEKKO_KEY_CHECK",
      entityType: "Branch",
      entityId: branch.id,
      branchId: branch.id,
      summary: `${branch.name}: kalit tekshiruvi muvaffaqiyatsiz`,
      after: { ok: false },
    }).catch(() => {});
    throw error;
  }
});

const syncLekkoNow = asyncHandler(async (req, res) => {
  const branch = await prisma.branch.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, isActive: true, lekkoApiKey: true },
  });
  if (!branch || !branch.isActive) throw new AppError("Filial topilmadi yoki faol emas", 404, "NOT_FOUND");
  if (!plainKey(branch)) throw new AppError("Filial uchun LEKKO API kaliti biriktirilmagan", 400, "LEKKO_KEY_MISSING");

  const startedAt = new Date();
  try {
    const result = await syncBranchStock(branch.id, { fullSync: false });
    const log = await writeSyncResult({ branchId: branch.id, trigger: "MANUAL", startedAt, result });
    return sendSuccess(
      res,
      {
        branchId: branch.id,
        lastSyncedAt: result.lastSyncedAt,
        updatedCount: log.updatedCount,
        addedCount: log.addedCount,
        errorCount: log.errorCount,
        message: log.message,
        status: log.status,
      },
      "Sinxron tugadi"
    );
  } catch (error) {
    await writeSyncResult({ branchId: branch.id, trigger: "MANUAL", startedAt, error }).catch(() => {});
    throw error;
  }
});

module.exports = {
  lekkoSettings,
  updateLekkoSettings,
  listLekkoLogs,
  checkLekkoKey,
  syncLekkoNow,
};
