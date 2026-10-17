const prisma = require("./prisma");
const { AppError } = require("./response");

const INTERVAL_KEY = "lekko.syncIntervalMin";
const DEFAULT_MINUTES = 10;

function clampSyncIntervalMinutes(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new AppError("Sinxron oralig'i 1 dan 1440 daqiqagacha bo'lsin", 400, "VALIDATION_ERROR");
  }
  return minutes;
}

function envIntervalMinutes() {
  const ms = Number(process.env.LEKKO_SYNC_INTERVAL_MS || DEFAULT_MINUTES * 60 * 1000);
  const minutes = Math.round(ms / 60000);
  return minutes >= 1 && minutes <= 1440 ? minutes : DEFAULT_MINUTES;
}

async function readSyncIntervalMinutes() {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: INTERVAL_KEY } });
    const stored = Number(row?.value);
    if (Number.isInteger(stored) && stored >= 1 && stored <= 1440) return stored;
  } catch {
    return envIntervalMinutes();
  }
  return envIntervalMinutes();
}

async function saveSyncIntervalMinutes(value) {
  const minutes = clampSyncIntervalMinutes(value);
  await prisma.systemSetting.upsert({
    where: { key: INTERVAL_KEY },
    create: { key: INTERVAL_KEY, value: String(minutes) },
    update: { value: String(minutes) },
  });
  return minutes;
}

function logMessage(result, error) {
  if (error) return String(error.message || "Sinxron xato").slice(0, 500);
  if (result?.changed === false) return "O'zgarish yo'q";
  return null;
}

async function writeSyncResult({ branchId, trigger, startedAt, result, error }) {
  const finishedAt = new Date();
  const failed = Boolean(error);
  const message = logMessage(result, error);
  const log = await prisma.lekkoSyncLog.create({
    data: {
      branchId,
      trigger,
      status: failed ? "ERROR" : "OK",
      updatedCount: failed ? 0 : Number(result?.upserted || 0),
      addedCount: failed ? 0 : Number(result?.medicinesCreated || 0),
      errorCount: failed ? 1 : Number(result?.skippedUnknown || 0),
      message,
      startedAt: startedAt || finishedAt,
      finishedAt,
    },
  });
  await prisma.branch.update({
    where: { id: branchId },
    data: failed
      ? { lekkoLastError: message, lekkoLastErrorAt: finishedAt }
      : { lekkoLastError: null, lekkoLastErrorAt: null },
  });
  return log;
}

function serializeLog(row) {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch?.name || "",
    trigger: row.trigger,
    status: row.status,
    updatedCount: row.updatedCount,
    addedCount: row.addedCount,
    errorCount: row.errorCount,
    message: row.message,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

module.exports = {
  INTERVAL_KEY,
  clampSyncIntervalMinutes,
  readSyncIntervalMinutes,
  saveSyncIntervalMinutes,
  writeSyncResult,
  serializeLog,
};
