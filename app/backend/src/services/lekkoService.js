const axios = require("axios");
const prisma = require("../lib/prisma");
const { decryptSecret } = require("../lib/secrets");
const { AppError } = require("../lib/response");
const { runDbTransaction } = require("../lib/transaction");
const { buildSearchText } = require("../lib/searchText");
const { prescriptionPatch } = require("../lib/rxApply");

const LEKKO_API_URL = process.env.LEKKO_API_URL || "https://pharmalekko.uz/api/public/v1";
const LEKKO_TIMEOUT_MS = Number(process.env.LEKKO_TIMEOUT_MS || 15_000);
const LEKKO_PAGE_SIZE = Number(process.env.LEKKO_PAGE_SIZE || 500);
const LEKKO_MAX_PAGES = Number(process.env.LEKKO_MAX_PAGES || 200);
const LEKKO_CATALOG_MAX_PAGES = Number(process.env.LEKKO_CATALOG_MAX_PAGES || 5);
const LEKKO_MAX_RETRIES = Number(process.env.LEKKO_MAX_RETRIES || 5);
const REQUESTS_PER_MINUTE = 100;
const MIN_GAP_MS = Math.ceil(60_000 / REQUESTS_PER_MINUTE);
const OVERLAP_MS = 2 * 60 * 1000;

const lastCallAtByKey = new Map();
const keyQueues = new Map();
const branchLocks = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function maskKey(apiKey) {
  const value = String(apiKey || "");
  if (value.length < 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

function parseRetryAfter(header) {
  if (header == null || header === "") return MIN_GAP_MS * 2;
  const asNumber = Number(header);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber > 1000 ? asNumber : asNumber * 1000;
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.max(asDate - Date.now(), MIN_GAP_MS);
  }
  return MIN_GAP_MS * 2;
}

function mapLekkoError(error) {
  const status = error.response?.status;
  const payload = error.response?.data;
  const remoteMessage =
    (payload && (payload.message || payload.error || payload.title)) || error.message || "Noma'lum xato";

  if (status === 401 || status === 403) {
    return new AppError("LEKKO API kaliti noto'g'ri yoki ruxsat yo'q", 401, "LEKKO_UNAUTHORIZED");
  }
  if (status === 429) {
    return new AppError("LEKKO so'rovlar limiti oshdi", 429, "LEKKO_RATE_LIMIT");
  }
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new AppError("LEKKO API javob bermadi (timeout)", 504, "LEKKO_TIMEOUT");
  }
  if (!error.response) {
    return new AppError(`LEKKO API bilan aloqa yo'q: ${error.message}`, 502, "LEKKO_UNAVAILABLE");
  }
  return new AppError(
    `LEKKO API xatosi: ${remoteMessage}`,
    status >= 400 && status < 500 ? status : 502,
    "LEKKO_ERROR"
  );
}

async function withKeyQueue(apiKey, task) {
  const prev = keyQueues.get(apiKey) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  keyQueues.set(apiKey, prev.then(() => gate, () => gate));
  await prev.catch(() => {});
  try {
    return await task();
  } finally {
    release();
  }
}

async function respectRateLimit(apiKey) {
  const last = lastCallAtByKey.get(apiKey) || 0;
  const waitMs = MIN_GAP_MS - (Date.now() - last);
  if (waitMs > 0) await sleep(waitMs);
  lastCallAtByKey.set(apiKey, Date.now());
}

const lekkoClient = axios.create({
  baseURL: LEKKO_API_URL.replace(/\/$/, ""),
  timeout: LEKKO_TIMEOUT_MS,
  headers: {
    Accept: "application/json",
  },
  validateStatus: (status) => status >= 200 && status < 300,
});

async function lekkoGetUnqueued(apiKey, path, params = {}, attempt = 0) {
  await respectRateLimit(apiKey);

  try {
    const response = await lekkoClient.get(path, {
      params,
      headers: { "X-Api-Key": apiKey },
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 429 && attempt < LEKKO_MAX_RETRIES) {
      const retryMs = parseRetryAfter(error.response.headers?.["retry-after"]);
      console.warn(
        `[LEKKO] 429 ${path} key=${maskKey(apiKey)} retryAfter=${Math.round(retryMs)}ms attempt=${attempt + 1}`
      );
      await sleep(retryMs);
      return lekkoGetUnqueued(apiKey, path, params, attempt + 1);
    }
    throw mapLekkoError(error);
  }
}

async function lekkoGet(apiKey, path, params = {}) {
  if (!apiKey) {
    throw new AppError("LEKKO API kaliti majburiy", 400, "LEKKO_KEY_MISSING");
  }

  return withKeyQueue(apiKey, () => lekkoGetUnqueued(apiKey, path, params));
}

function unwrapPage(payload) {
  if (Array.isArray(payload)) {
    return { items: payload, hasNext: false, nextCursor: null };
  }

  const root = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const items =
    root?.items ||
    root?.data ||
    root?.results ||
    root?.products ||
    root?.lots ||
    root?.stocks ||
    payload?.items ||
    [];

  const hasNext = Boolean(
    root?.hasNext ?? root?.hasMore ?? payload?.hasNext ?? payload?.hasMore
  );
  const nextCursor = root?.nextCursor || root?.cursor || payload?.nextCursor || null;
  const nextPage = root?.nextPage ?? payload?.nextPage ?? null;

  return {
    items: Array.isArray(items) ? items : [],
    hasNext: hasNext || Boolean(nextCursor) || Boolean(nextPage),
    nextCursor,
    nextPage,
    page: Number(root?.page || payload?.page || 0) || 0,
    totalPages: Number(root?.totalPages || payload?.totalPages || 0) || 0,
    totalCount: Number(root?.totalCount || payload?.totalCount || 0) || 0,
  };
}

async function forEachPage(apiKey, path, extraParams, onPage) {
  let page = 1;
  let cursor = extraParams.cursor || extraParams.pageToken || null;
  let fetched = 0;

  for (let i = 0; i < LEKKO_MAX_PAGES; i += 1) {
    const params = {
      pageSize: LEKKO_PAGE_SIZE,
      ...extraParams,
    };
    delete params.cursor;
    delete params.pageToken;

    if (cursor) {
      params.cursor = cursor;
      params.pageToken = cursor;
    } else {
      params.page = page;
    }

    const payload = await lekkoGet(apiKey, path, params);
    const parsed = unwrapPage(payload);
    fetched += parsed.items.length;
    if (parsed.items.length) {
      await onPage(parsed.items, parsed);
    }

    if (parsed.nextCursor) {
      cursor = parsed.nextCursor;
      continue;
    }

    if (parsed.nextPage) {
      page = Number(parsed.nextPage);
      cursor = null;
      continue;
    }

    const hasMorePages = parsed.totalPages > 0 && page < parsed.totalPages;
    if ((parsed.hasNext || hasMorePages) && parsed.items.length > 0) {
      page += 1;
      cursor = null;
      continue;
    }

    break;
  }

  return fetched;
}

async function fetchAllPages(apiKey, path, extraParams = {}) {
  const collected = [];
  await forEachPage(apiKey, path, extraParams, async (items) => {
    collected.push(...items);
  });
  return collected;
}

function toInt(value) {
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toPrice(value) {
  const num = toFiniteNumber(value);
  if (num == null) return "0.00";
  return num.toFixed(2);
}

function slugify(value, fallback) {
  const latin = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return latin || fallback;
}

// Catalog `id` is the same identifier that /stock returns as `drugId`;
// `lekkoDrugId` is a different (global) id and must not be used for matching.
function pickDrugId(row) {
  return toInt(row?.id ?? row?.drugId ?? row?.productId ?? row?.catalogProductId);
}

// 2026-10-25 dump: katalog kalitlari id, name, lekkoDrugId, tradeMark, mnn, form,
// dose, quantityInPack, pharmGroup, atx, variants. Rx boolean yo'q.
// atx/mnn/pharmGroup namunalarda null. Zaxira lotida Rx va ATC yo'q.
function readAtcCode(row) {
  const raw = row?.atx;
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const text = String(raw).trim();
  if (!text || text.toLowerCase() === "null") return undefined;
  return text.slice(0, 32);
}

function mapProduct(row) {
  const variant = Array.isArray(row?.variants) ? row.variants[0] : null;
  const drugId = pickDrugId(row);
  const name = String(row?.name || row?.drugName || row?.title || row?.fullName || "").trim();
  const form = String(row?.form || row?.dosageForm || row?.releaseForm || "").trim();
  const dose = String(row?.dose || "").trim();
  const mapped = {
    drugId,
    name: name || `LEKKO dori ${drugId || ""}`.trim(),
    barcode: variant?.barcode || row?.barcode || row?.barCode || row?.ean || null,
    ikpuCode: variant?.ikpuCode || row?.ikpuCode || row?.ikpu || row?.mxik || null,
    quantityInPack: toInt(row?.quantityInPack || row?.packSize || row?.unitsInPack) || 1,
    manufacturer: String(
      variant?.producer || row?.manufacturer || row?.producer || row?.tradeMark || "Noma'lum"
    ).trim(),
    dosageForm: [form, dose].filter(Boolean).join(" ") || "Noma'lum",
    description: String(row?.description || row?.mnn || row?.tradeMark || name || "").trim(),
    categoryName: row?.pharmGroup || row?.categoryName || row?.category?.name || form || null,
  };
  const mnn = String(row?.mnn || "").trim();
  if (mnn && mnn.toLowerCase() !== "null") mapped.activeIngredient = mnn;
  const atcCode = readAtcCode(row);
  if (atcCode) mapped.atcCode = atcCode;
  return mapped;
}

/**
 * One LEKKO /stock batch (partiya) → normalized lot.
 * quantityPacks is fractional (4.8), so units are preferred.
 */
function mapLot(row) {
  const quantityInPack = Math.max(1, toInt(row?.quantityInPack) || 1);
  const quantityUnits = toFiniteNumber(row?.quantityUnits);
  const quantityPacks = toFiniteNumber(row?.quantityPacks);
  const units =
    quantityUnits != null
      ? quantityUnits
      : quantityPacks != null
        ? quantityPacks * quantityInPack
        : 0;
  const reservedUnits = Math.max(0, toFiniteNumber(row?.reservedUnits) || 0);

  return {
    drugId: toInt(row?.drugId),
    name: String(row?.drugName || "").trim() || null,
    manufacturer: String(row?.producerName || "").trim() || null,
    barcode: row?.barcode ? String(row.barcode) : null,
    ikpuCode: row?.ikpuCode ? String(row.ikpuCode) : null,
    quantityInPack,
    sellable: !row?.isBlocked && row?.forSale !== false,
    availableUnits: Math.max(0, Math.floor(units - reservedUnits)),
    price: toFiniteNumber(row?.salePriceWithNds ?? row?.salePrice),
    pricedAt: Date.parse(row?.incomeDate || row?.updatedAt || "") || 0,
  };
}

async function withBranchLock(branchId, task) {
  const prev = branchLocks.get(branchId) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  branchLocks.set(branchId, prev.then(() => gate, () => gate));
  await prev.catch(() => {});
  try {
    return await task();
  } finally {
    release();
  }
}

async function ensureCategory(name) {
  const label = String(name || "LEKKO katalogi").trim() || "LEKKO katalogi";
  const slug = slugify(label, "lekko");

  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return existing;

  const sortOrder = (await prisma.category.count()) + 1;
  try {
    return await prisma.category.create({
      data: {
        name: label,
        slug,
        icon: "pill",
        sortOrder,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      return prisma.category.findUnique({ where: { slug } });
    }
    throw error;
  }
}

async function verifyKey(apiKey) {
  const payload = await lekkoGet(apiKey, "/me");
  const store =
    payload?.drugStore ||
    payload?.drugstore ||
    payload?.data?.drugStore ||
    payload?.data ||
    payload;

  const drugStoreId = toInt(store?.id ?? store?.drugStoreId ?? payload?.drugStoreId);
  return {
    drugStoreId,
    name: store?.name || store?.title || store?.drugStoreName || "",
    raw: payload,
  };
}

async function upsertMappedProducts(mapped) {
  const categoryCache = new Map();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const medicineIds = [];

  async function categoryFor(name) {
    const label = String(name || "LEKKO katalogi").trim() || "LEKKO katalogi";
    if (categoryCache.has(label)) return categoryCache.get(label);
    const category = await ensureCategory(label);
    categoryCache.set(label, category);
    return category;
  }

  const valid = mapped.filter((product) => product.drugId);
  skipped += mapped.length - valid.length;
  if (!valid.length) {
    return { created, updated, skipped, medicineIds };
  }

  const existing = await prisma.medicine.findMany({
    where: { externalApiId: { in: valid.map((item) => item.drugId) } },
    select: {
      id: true,
      externalApiId: true,
      isPrescription: true,
      rxSource: true,
      atcCode: true,
      rxNeedsReview: true,
      activeIngredient: true,
      searchText: true,
    },
  });
  const byExternalId = new Map(existing.map((item) => [item.externalApiId, item]));

  for (const product of valid) {
    const category = await categoryFor(product.categoryName);
    const current = byExternalId.get(product.drugId);
    const { patch } = prescriptionPatch(product, current || null);
    const data = {
      name: product.name,
      slug: `lekko-${product.drugId}`,
      description: product.description || product.name,
      manufacturer: product.manufacturer,
      dosageForm: product.dosageForm,
      barcode: product.barcode ? String(product.barcode) : null,
      ikpuCode: product.ikpuCode ? String(product.ikpuCode) : null,
      quantityInPack: product.quantityInPack,
      categoryId: category.id,
      // imageUrl is intentionally absent: sync must never overwrite uploaded images.
      ...patch,
    };
    data.searchText = buildSearchText(data);

    if (current) {
      const update = {
        name: data.name,
        description: data.description,
        manufacturer: data.manufacturer,
        dosageForm: data.dosageForm,
        barcode: data.barcode,
        ikpuCode: data.ikpuCode,
        quantityInPack: data.quantityInPack,
        categoryId: data.categoryId,
        searchText: data.searchText,
      };
      if (patch.atcCode) update.atcCode = patch.atcCode;
      if (Object.prototype.hasOwnProperty.call(patch, "isPrescription")) {
        update.isPrescription = patch.isPrescription;
        update.rxSource = patch.rxSource;
        update.rxNeedsReview = patch.rxNeedsReview;
      }
      await prisma.medicine.update({
        where: { id: current.id },
        data: update,
      });
      medicineIds.push(current.id);
      updated += 1;
    } else {
      const createdMed = await prisma.medicine.create({
        data: {
          ...data,
          externalApiId: product.drugId,
          imageEmoji: "-",
        },
      });
      medicineIds.push(createdMed.id);
      created += 1;
    }
  }

  return { created, updated, skipped, medicineIds };
}

async function ensureBranchStockRows(branchId, medicineIds) {
  const ids = [...new Set((medicineIds || []).filter(Boolean))];
  if (!branchId || !ids.length) return 0;

  const existing = await prisma.branchStock.findMany({
    where: { branchId, medicineId: { in: ids } },
    select: { medicineId: true },
  });
  const have = new Set(existing.map((row) => row.medicineId));
  const missing = ids.filter((id) => !have.has(id));
  if (!missing.length) return 0;

  await prisma.branchStock.createMany({
    data: missing.map((medicineId) => ({
      branchId,
      medicineId,
      price: "0.00",
      stockCount: 0,
      reservedCount: 0,
    })),
  });

  return missing.length;
}

async function syncCatalogFromProductIds(apiKey, productIds) {
  const ids = [...new Set((productIds || []).map((id) => toInt(id)).filter(Boolean))];
  let fetched = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const medicineIds = [];

  for (const productId of ids) {
    try {
      const payload = await lekkoGet(apiKey, `/catalog/products/${productId}`);
      const product = mapProduct(payload?.data || payload);
      if (!product.drugId) {
        skipped += 1;
        continue;
      }
      fetched += 1;
      const result = await upsertMappedProducts([product]);
      created += result.created;
      updated += result.updated;
      skipped += result.skipped;
      medicineIds.push(...result.medicineIds);
    } catch (error) {
      skipped += 1;
      console.warn(`[LEKKO] product ${productId} olinmadi: ${error.message}`);
    }
  }

  return { mode: "stock-products", fetched, created, updated, skipped, medicineIds };
}

async function syncBranchCatalog(apiKey, { maxPages = LEKKO_CATALOG_MAX_PAGES } = {}) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let fetched = 0;
  const medicineIds = [];
  const pageLimit = Math.max(1, Number(maxPages) || LEKKO_CATALOG_MAX_PAGES);
  let page = 1;

  for (let i = 0; i < pageLimit; i += 1) {
    const payload = await lekkoGet(apiKey, "/catalog/products", {
      pageSize: LEKKO_PAGE_SIZE,
      page,
    });
    const parsed = unwrapPage(payload);
    if (!parsed.items.length) break;

    fetched += parsed.items.length;
    const result = await upsertMappedProducts(parsed.items.map(mapProduct));
    created += result.created;
    updated += result.updated;
    skipped += result.skipped;
    medicineIds.push(...result.medicineIds);

    console.log(
      `[LEKKO] katalog sahifa ${parsed.page || page}/${pageLimit} fetched=${fetched} created=${created}`
    );

    const hasMore =
      parsed.hasNext ||
      (parsed.totalPages > 0 && page < parsed.totalPages) ||
      parsed.items.length === LEKKO_PAGE_SIZE;
    if (!hasMore) break;
    page += 1;
  }

  return {
    mode: "limited-catalog",
    maxPages: pageLimit,
    fetched,
    created,
    updated,
    skipped,
    medicineIds,
  };
}

async function syncCatalogForBranch(apiKey, lots) {
  const byDrug = aggregateLots(lots || []);
  if (byDrug.size === 0) {
    console.log("[LEKKO] bu dorixona ombori bo'sh — umumiy katalog filialga yozilmaydi");
    return {
      mode: "stock-products",
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      medicineIds: [],
    };
  }

  console.log(`[LEKKO] katalog: faqat shu dorixona omboridagi ${byDrug.size} ta dori`);
  return syncCatalogFromProductIds(apiKey, [...byDrug.keys()]);
}

async function removeCatalogPlaceholders(branchId, ownedDrugIds = []) {
  const owned = [...new Set((ownedDrugIds || []).filter(Boolean))];
  const result = await prisma.branchStock.deleteMany({
    where: {
      branchId,
      stockCount: 0,
      reservedCount: 0,
      price: 0,
      medicine: {
        AND: [
          { externalApiId: { not: null } },
          ...(owned.length ? [{ externalApiId: { notIn: owned } }] : []),
        ],
      },
    },
  });
  if (result.count) {
    console.log(`[LEKKO] ${result.count} ta begona katalog qoldig'i olib tashlandi`);
  }
  return result.count;
}

/**
 * Groups lots by drugId: sellable units are summed across batches,
 * price comes from the most recently received batch.
 */
function aggregateLots(lots) {
  const byDrug = new Map();

  for (const raw of lots) {
    const lot = mapLot(raw);
    if (!lot.drugId) continue;

    const current = byDrug.get(lot.drugId) || {
      ...lot,
      availableUnits: 0,
      price: null,
      pricedAt: -1,
    };

    if (lot.sellable) current.availableUnits += lot.availableUnits;
    if (lot.price != null && lot.price > 0 && lot.pricedAt >= current.pricedAt) {
      current.price = lot.price;
      current.pricedAt = lot.pricedAt;
    }
    byDrug.set(lot.drugId, current);
  }

  return byDrug;
}

/**
 * Only part of the 53k catalog is imported locally, so medicines that exist
 * in the branch stock but not in the DB are created from lot data.
 * Existing medicines are never updated here (imageUrl and curated fields stay intact).
 */
async function ensureMedicinesForLots(byDrug) {
  const drugIds = [...byDrug.keys()];
  const medicineByDrugId = new Map();

  for (let i = 0; i < drugIds.length; i += 500) {
    const rows = await prisma.medicine.findMany({
      where: { externalApiId: { in: drugIds.slice(i, i + 500) } },
      select: {
        id: true,
        externalApiId: true,
        name: true,
        dosageForm: true,
        activeIngredient: true,
        searchText: true,
        atcCode: true,
        isPrescription: true,
        rxSource: true,
        rxNeedsReview: true,
      },
    });
    for (const row of rows) {
      medicineByDrugId.set(row.externalApiId, row);
      if (row.rxSource) continue;
      const { patch } = prescriptionPatch(
        {
          name: row.name,
          dosageForm: row.dosageForm,
          activeIngredient: row.activeIngredient || undefined,
          atcCode: row.atcCode || undefined,
        },
        row
      );
      if (!Object.prototype.hasOwnProperty.call(patch, "isPrescription") && patch.rxNeedsReview !== true) continue;
      await prisma.medicine.update({
        where: { id: row.id },
        data: {
          ...(Object.prototype.hasOwnProperty.call(patch, "isPrescription")
            ? {
                isPrescription: patch.isPrescription,
                rxSource: patch.rxSource,
                rxNeedsReview: patch.rxNeedsReview,
              }
            : { rxNeedsReview: true }),
        },
      });
    }
  }

  const missing = drugIds.filter((drugId) => !medicineByDrugId.has(drugId));
  if (!missing.length) return { medicineByDrugId, created: 0 };

  const category = await ensureCategory("LEKKO katalogi");
  for (const drugId of missing) {
    const lot = byDrug.get(drugId);
    const name = lot.name || `LEKKO dori ${drugId}`;
    const dosageForm = "Noma'lum";
    const { patch } = prescriptionPatch({ name, dosageForm }, null);
    const created = await prisma.medicine.create({
      data: {
        name,
        slug: `lekko-${drugId}`,
        description: name,
        manufacturer: lot.manufacturer || "Noma'lum",
        dosageForm,
        imageEmoji: "-",
        externalApiId: drugId,
        barcode: lot.barcode,
        ikpuCode: lot.ikpuCode,
        quantityInPack: lot.quantityInPack,
        categoryId: category.id,
        ...patch,
        searchText: buildSearchText({
          name,
          description: name,
          manufacturer: lot.manufacturer || "Noma'lum",
          dosageForm,
        }),
      },
      select: { id: true, externalApiId: true },
    });
    medicineByDrugId.set(drugId, created);
  }

  return { medicineByDrugId, created: missing.length };
}

/**
 * Writes aggregated stock into BranchStock. Local reservations (reservedCount)
 * are never undercut, and LEKKO-linked rows missing from the snapshot are zeroed.
 */
async function writeBranchStock(branchId, byDrug, medicineByDrugId, syncedAt = null) {
  return runDbTransaction(
    prisma,
    async (tx) => {
      const existingRows = await tx.branchStock.findMany({
        where: { branchId },
        select: {
          id: true,
          medicineId: true,
          stockCount: true,
          reservedCount: true,
          medicine: { select: { externalApiId: true } },
        },
      });
      const existingByMedicine = new Map(existingRows.map((row) => [row.medicineId, row]));

      const seenMedicineIds = new Set();
      let upserted = 0;

      for (const [drugId, lot] of byDrug.entries()) {
        const medicine = medicineByDrugId.get(drugId);
        if (!medicine) continue;

        const reserved = existingByMedicine.get(medicine.id)?.reservedCount || 0;
        const stockCount = Math.max(lot.availableUnits, reserved);
        const price = lot.price != null ? toPrice(lot.price) : null;

        await tx.branchStock.upsert({
          where: { branchId_medicineId: { branchId, medicineId: medicine.id } },
          update: {
            stockCount,
            ...(price != null ? { price } : {}),
          },
          create: {
            branchId,
            medicineId: medicine.id,
            stockCount,
            price: price ?? "0.00",
            reservedCount: 0,
          },
        });

        seenMedicineIds.add(medicine.id);
        upserted += 1;
      }

      let zeroed = 0;
      if (byDrug.size > 0) {
        for (const row of existingRows) {
          if (seenMedicineIds.has(row.medicineId)) continue;
          if (row.medicine?.externalApiId == null) continue;
          if (row.stockCount === row.reservedCount) continue;
          await tx.branchStock.update({
            where: { id: row.id },
            data: { stockCount: row.reservedCount },
          });
          zeroed += 1;
        }
      }

      if (syncedAt) {
        await tx.branch.update({
          where: { id: branchId },
          data: { lastSyncedAt: syncedAt },
        });
      }

      return { upserted, zeroed };
    },
    { maxWait: 15_000, timeout: 180_000 }
  );
}

async function fetchAllStockLots(apiKey) {
  const lots = [];
  let pages = 0;

  for (let page = 1; page <= LEKKO_MAX_PAGES; page += 1) {
    const parsed = unwrapPage(
      await lekkoGet(apiKey, "/stock", {
        pageSize: LEKKO_PAGE_SIZE,
        onlyInStock: false,
        page,
      })
    );
    pages += 1;
    lots.push(...parsed.items);

    if (!parsed.hasNext || !parsed.items.length) break;
    await sleep(200);
  }

  return { lots, pages };
}

async function hasStockChangesSince(apiKey, since) {
  const parsed = unwrapPage(
    await lekkoGet(apiKey, "/stock", {
      pageSize: 1,
      onlyInStock: false,
      updatedSince: new Date(since.getTime() - OVERLAP_MS).toISOString(),
    })
  );
  return parsed.totalCount > 0 || parsed.items.length > 0;
}

/**
 * Filial omborini LEKKO GET /stock dan sinxronlaydi:
 * partiyalar drugId bo'yicha jamlanadi va BranchStock ga yoziladi.
 */
async function syncBranchStock(branchId, apiKeyOrOptions, legacyFullSync = false, legacyPrefetchedLots = null) {
  if (!branchId) {
    throw new AppError("branchId majburiy", 400, "VALIDATION_ERROR");
  }

  const options =
    apiKeyOrOptions && typeof apiKeyOrOptions === "object" && !Array.isArray(apiKeyOrOptions)
      ? apiKeyOrOptions
      : {
          apiKey: typeof apiKeyOrOptions === "string" ? apiKeyOrOptions : null,
          fullSync: legacyFullSync,
          prefetchedLots: legacyPrefetchedLots,
        };

  const fullSync = Boolean(options.fullSync);
  const prefetchedLots = options.prefetchedLots ?? null;

  return withBranchLock(String(branchId), async () => {
    const branch = await prisma.branch.findUnique({
      where: { id: String(branchId) },
      select: {
        id: true,
        name: true,
        isActive: true,
        lekkoApiKey: true,
        lekkoDrugStoreId: true,
        lastSyncedAt: true,
      },
    });

    if (!branch || !branch.isActive) {
      throw new AppError("Filial topilmadi yoki faol emas", 404, "NOT_FOUND");
    }

    const apiKey = decryptSecret(String(options.apiKey || branch.lekkoApiKey || "")).trim();
    if (!apiKey) {
      throw new AppError("Filial uchun LEKKO API kaliti biriktirilmagan", 400, "LEKKO_KEY_MISSING");
    }

    const startedAt = new Date();
    const result = {
      branchId: branch.id,
      branchName: branch.name,
      lekkoDrugStoreId: branch.lekkoDrugStoreId,
      changed: true,
      lots: 0,
      pages: 0,
      medicines: 0,
      medicinesCreated: 0,
      upserted: 0,
      skippedUnknown: 0,
      zeroed: 0,
      lastSyncedAt: branch.lastSyncedAt,
    };

    // Per-drug stock is a sum over all batches, so a partial (updatedSince) page
    // cannot be applied on its own: it is only used to detect that anything changed.
    if (!prefetchedLots && !fullSync && branch.lastSyncedAt) {
      result.changed = await hasStockChangesSince(apiKey, branch.lastSyncedAt);
      if (!result.changed) {
        await prisma.branch.update({
          where: { id: branch.id },
          data: { lastSyncedAt: startedAt },
        });
        result.lastSyncedAt = startedAt;
        return result;
      }
    }

    const { lots, pages } = prefetchedLots
      ? { lots: prefetchedLots, pages: 0 }
      : await fetchAllStockLots(apiKey);

    const byDrug = aggregateLots(lots);
    const { medicineByDrugId, created } = await ensureMedicinesForLots(byDrug);
    const { upserted, zeroed } = await writeBranchStock(
      branch.id,
      byDrug,
      medicineByDrugId,
      startedAt
    );

    Object.assign(result, {
      lots: lots.length,
      pages,
      medicines: byDrug.size,
      medicinesCreated: created,
      upserted,
      skippedUnknown: byDrug.size - upserted,
      zeroed,
      lastSyncedAt: startedAt,
    });

    console.log(
      `[LEKKO] ${branch.name}: stock sync lots=${result.lots} drugs=${result.medicines} created=${created} upserted=${upserted} zeroed=${zeroed} store=${branch.lekkoDrugStoreId || "-"}`
    );

    return result;
  });
}

async function syncBranchFromLekko(branchId, { fullSync = false, syncCatalog = false } = {}) {
  const branch = await prisma.branch.findUnique({ where: { id: String(branchId) } });
  if (!branch || !branch.isActive) {
    throw new AppError("Filial topilmadi yoki faol emas", 404, "NOT_FOUND");
  }
  const apiKey = decryptSecret(branch.lekkoApiKey || "").trim();
  if (!apiKey) {
    throw new AppError("Bu filialga LEKKO API kaliti biriktirilmagan", 400, "LEKKO_KEY_MISSING");
  }

  const me = await verifyKey(apiKey);
  if (me.drugStoreId && me.drugStoreId !== branch.lekkoDrugStoreId) {
    await prisma.branch.update({
      where: { id: branch.id },
      data: { lekkoDrugStoreId: me.drugStoreId },
    });
  }

  const doFullStock = fullSync || !branch.lastSyncedAt;
  const stockParams = {
    pageSize: LEKKO_PAGE_SIZE,
    onlyInStock: false,
  };
  if (!doFullStock && branch.lastSyncedAt) {
    stockParams.updatedSince = new Date(branch.lastSyncedAt.getTime() - OVERLAP_MS).toISOString();
  }
  const lots = await fetchAllPages(apiKey, "/stock", stockParams);
  const ownedDrugIds = [...aggregateLots(lots).keys()];

  const catalog =
    syncCatalog && ownedDrugIds.length
      ? await syncCatalogForBranch(apiKey, lots)
      : null;

  const stock = await syncBranchStock(branch.id, apiKey, doFullStock, lots);
  const removedPlaceholders = doFullStock
    ? await removeCatalogPlaceholders(branch.id, ownedDrugIds)
    : 0;

  return {
    drugStore: { id: me.drugStoreId, name: me.name },
    catalog,
    stock: { ...stock, removedPlaceholders },
  };
}

module.exports = {
  LEKKO_API_URL,
  REQUESTS_PER_MINUTE,
  LEKKO_CATALOG_MAX_PAGES,
  verifyKey,
  syncBranchCatalog,
  syncBranchStock,
  syncBranchFromLekko,
  ensureBranchStockRows,
  mapProduct,
  prescriptionPatch,
};
