const prisma = require("../lib/prisma");
const { expireStaleReservations } = require("../lib/stock");
const { encryptSecret, decryptSecret } = require("../lib/secrets");
const { syncBranchStock } = require("../services/lekkoService");
const { readSyncIntervalMinutes, writeSyncResult } = require("../lib/lekkoSync");

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const RESERVATION_SWEEP_MS = 60 * 1000;
const BRANCH_GAP_MS = Number(process.env.LEKKO_BRANCH_GAP_MS || 300);

let timer = null;
let nextTimer = null;
let reservationTimer = null;
let cycleInFlight = false;
let sweepInFlight = false;
let workerStarted = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function intervalMs() {
  return Number(process.env.LEKKO_SYNC_INTERVAL_MS || DEFAULT_INTERVAL_MS);
}

function syncEnabled() {
  const raw = String(process.env.LEKKO_SYNC_ENABLED ?? "true").toLowerCase();
  return raw !== "false" && raw !== "0";
}

async function attachEnvLekkoKey() {
  const apiKey = String(process.env.LEKKO_API_KEY || "").trim();
  if (!apiKey) return 0;

  const branchId = String(process.env.LEKKO_BRANCH_ID || "").trim();
  const where = branchId
    ? { id: branchId, isActive: true }
    : { isActive: true };

  const drugStoreId = Number(process.env.LEKKO_DRUGSTORE_ID || 0) || null;
  const branches = await prisma.branch.findMany({
    where,
    select: { id: true, name: true, lekkoApiKey: true, lekkoDrugStoreId: true },
  });
  let attached = 0;

  for (const branch of branches) {
    const needsKey = !decryptSecret(branch.lekkoApiKey || "").trim();
    const needsStore = drugStoreId && branch.lekkoDrugStoreId !== drugStoreId;
    if (!needsKey && !needsStore) continue;
    await prisma.branch.update({
      where: { id: branch.id },
      data: {
        ...(needsKey ? { lekkoApiKey: encryptSecret(apiKey) } : {}),
        ...(needsStore ? { lekkoDrugStoreId: drugStoreId } : {}),
      },
    });
    attached += 1;
    console.log(`[LEKKO] ${branch.name} kalit/drugstore biriktirildi`);
  }

  return attached;
}

async function runStockSyncCycle() {
  if (cycleInFlight) {
    console.warn("[LEKKO] Oldingi sinxronizatsiya hali tugamagan, sikl o'tkazib yuborildi");
    return { skipped: true };
  }

  cycleInFlight = true;
  const started = Date.now();
  const summary = { ok: 0, failed: 0, branches: 0 };

  try {
    const branches = await prisma.branch.findMany({
      where: {
        isActive: true,
        AND: [{ lekkoApiKey: { not: null } }, { lekkoApiKey: { not: "" } }],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        lastSyncedAt: true,
      },
    });

    summary.branches = branches.length;

    for (let index = 0; index < branches.length; index += 1) {
      const branch = branches[index];
      const startedAt = new Date();
      try {
        const stock = await syncBranchStock(branch.id, {
          fullSync: !branch.lastSyncedAt,
        });
        await writeSyncResult({ branchId: branch.id, trigger: "AUTO", startedAt, result: stock });
        summary.ok += 1;
        console.log(
          `[LEKKO] ${branch.name}: ombor sinxronlandi lots=${stock.lots} upserted=${stock.upserted} skipped=${stock.skippedUnknown}`
        );
      } catch (error) {
        summary.failed += 1;
        await writeSyncResult({
          branchId: branch.id,
          trigger: "AUTO",
          startedAt,
          error,
        }).catch(() => {});
        console.error(`[LEKKO] ${branch.name} sinxronlash xatosi: ${error.message}`);
      }

      if (index < branches.length - 1) {
        await sleep(BRANCH_GAP_MS);
      }
    }
  } catch (error) {
    console.error(`[LEKKO] Sikl xatosi: ${error.message}`);
  } finally {
    cycleInFlight = false;
  }

  console.log(
    `[LEKKO] Sikl tugadi: ${summary.ok} muvaffaqiyatli, ${summary.failed} xato, ${summary.branches} filial, ${Date.now() - started}ms`
  );
  return summary;
}

async function sweepExpiredReservations() {
  if (sweepInFlight) return;
  sweepInFlight = true;
  try {
    const expired = await expireStaleReservations();
    if (expired > 0) {
      console.log(`[stock] ${expired} ta muddati o'tgan zaxira omborga qaytarildi`);
    }
  } catch (error) {
    console.error("[stock] Zaxira tozalash xatosi:", error.message);
  } finally {
    sweepInFlight = false;
  }
}

function startReservationSweep() {
  if (reservationTimer) return;
  console.log("[stock] Muddati o'tgan zaxira har 60 soniyada tekshiriladi");
  const first = setTimeout(() => {
    sweepExpiredReservations().catch((error) => {
      console.error("[stock] Birinchi zaxira tekshiruvi:", error.message);
    });
  }, 5000);
  if (typeof first.unref === "function") first.unref();

  reservationTimer = setInterval(() => {
    sweepExpiredReservations().catch((error) => {
      console.error("[stock] Zaxira tekshiruvi:", error.message);
    });
  }, RESERVATION_SWEEP_MS);

  if (typeof reservationTimer.unref === "function") {
    reservationTimer.unref();
  }
}

async function scheduleNext() {
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
  if (!workerStarted || !syncEnabled()) return;
  const minutes = await readSyncIntervalMinutes().catch(() => Math.round(intervalMs() / 60000));
  const ms = Math.max(60_000, minutes * 60 * 1000);
  nextTimer = setTimeout(() => {
    runStockSyncCycle()
      .catch((error) => {
        console.error("[LEKKO] Kutilmagan worker xatosi:", error.message);
      })
      .finally(() => {
        scheduleNext().catch((error) => {
          console.error("[LEKKO] Keyingi sikl rejalashtirilmadi:", error.message);
        });
      });
  }, ms);
  if (typeof nextTimer.unref === "function") nextTimer.unref();
}

function rescheduleStockSync() {
  if (!workerStarted) return;
  scheduleNext().catch((error) => {
    console.error("[LEKKO] Oraliq yangilanmadi:", error.message);
  });
}

function startStockSyncWorker() {
  startReservationSweep();

  if (!syncEnabled()) {
    console.log("[LEKKO] Fon sinxronizatsiya o'chirilgan (LEKKO_SYNC_ENABLED=false)");
    return;
  }

  if (workerStarted) return;
  workerStarted = true;

  readSyncIntervalMinutes()
    .then((minutes) => {
      console.log(`[LEKKO] Fon sinxronizatsiya har ${minutes} daqiqada`);
    })
    .catch(() => {
      console.log(`[LEKKO] Fon sinxronizatsiya har ${Math.round(intervalMs() / 60000)} daqiqada`);
    });

  const kickoff = async () => {
    try {
      await attachEnvLekkoKey();
      await runStockSyncCycle();
    } catch (error) {
      console.error("[LEKKO] Birinchi sikl xatosi:", error.message);
    } finally {
      await scheduleNext();
    }
  };

  timer = setTimeout(kickoff, 2000);
  if (typeof timer.unref === "function") timer.unref();
}

function stopStockSyncWorker() {
  workerStarted = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
  if (reservationTimer) {
    clearInterval(reservationTimer);
    reservationTimer = null;
  }
}

module.exports = {
  startStockSyncWorker,
  stopStockSyncWorker,
  runStockSyncCycle,
  rescheduleStockSync,
};
