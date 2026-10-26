/**
 * Dev-only: one catalog product and one stock lot, keys only.
 * Does not print the API key. Values are printed only for Rx/ATC-like fields.
 *
 *   node scripts/lekko-dump.cjs
 *
 * 2026-10-25 natija (pharmalekko.uz, pageSize 1 + 500 va keyingi sahifalar):
 * Katalog kalitlari: id, name, lekkoDrugId, tradeMark, mnn, form, dose,
 * quantityInPack, pharmGroup, atx, variants[].
 * Rx boolean (isPrescription/rx/recipeRequired/isRx) YO'Q.
 * atx, mnn, pharmGroup kalitlari bor, tekshirilgan ~1500 qatorda hammasi null.
 * Zaxira /stock lotida Rx, ATC va MNN yo'q (drugName, producerName, narx, qoldiq).
 */
require("dotenv").config();
const axios = require("axios");

const baseURL = String(process.env.LEKKO_API_URL || "https://pharmalekko.uz/api/public/v1").replace(/\/$/, "");
const apiKey = String(process.env.LEKKO_API_KEY || "").trim();

const INTERESTING = /rx|recipe|recept|prescri|atc|mnn|inn|pharm|group|form|dose|classif|narcot|control|otc|recipe/i;

function keyTree(value, prefix = "", depth = 0, lines = []) {
  if (depth > 4 || value == null) return lines;
  if (Array.isArray(value)) {
    lines.push(`${prefix}[] length=${value.length}`);
    if (value[0] && typeof value[0] === "object") keyTree(value[0], `${prefix}[0]`, depth + 1, lines);
    return lines;
  }
  if (typeof value !== "object") return lines;
  for (const key of Object.keys(value)) {
    const child = value[key];
    const kind = Array.isArray(child) ? "array" : child === null ? "null" : typeof child;
    lines.push(`${prefix}.${key} (${kind})`);
    if (child && typeof child === "object") keyTree(child, `${prefix}.${key}`, depth + 1, lines);
  }
  return lines;
}

function interestingValues(value, prefix = "", depth = 0, out = []) {
  if (depth > 5 || value == null) return out;
  if (Array.isArray(value)) {
    value.slice(0, 3).forEach((item, index) => interestingValues(item, `${prefix}[${index}]`, depth + 1, out));
    return out;
  }
  if (typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    const path = `${prefix}.${key}`;
    if (INTERESTING.test(key) && (child == null || ["string", "number", "boolean"].includes(typeof child))) {
      const shown = child == null ? null : String(child).slice(0, 120);
      out.push(`${path} = ${JSON.stringify(shown)}`);
    }
    if (child && typeof child === "object") interestingValues(child, path, depth + 1, out);
  }
  return out;
}

async function get(path, params) {
  const response = await axios.get(`${baseURL}${path}`, {
    params,
    timeout: 20000,
    headers: { Accept: "application/json", "X-Api-Key": apiKey },
  });
  return response.data;
}

function firstItem(payload) {
  if (Array.isArray(payload)) return { rootKeys: ["<array>"], item: payload[0] || null };
  const root = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const items = root?.items || root?.data || root?.results || root?.products || root?.lots || root?.stocks || payload?.items || [];
  return {
    rootKeys: Object.keys(payload || {}),
    nestedKeys: root && root !== payload ? Object.keys(root) : [],
    item: Array.isArray(items) ? items[0] || null : null,
    totalCount: root?.totalCount ?? payload?.totalCount ?? null,
  };
}

async function main() {
  if (!apiKey) {
    console.error("LEKKO_API_KEY bo'sh");
    process.exit(1);
  }
  console.log(`baseURL=${baseURL}`);

  const catalog = await get("/catalog/products", { pageSize: 1, page: 1 });
  const catalogPage = firstItem(catalog);
  console.log("\n=== CATALOG /catalog/products pageSize=1 ===");
  console.log("rootKeys:", catalogPage.rootKeys.join(", "));
  if (catalogPage.nestedKeys.length) console.log("nestedKeys:", catalogPage.nestedKeys.join(", "));
  console.log("totalCount:", catalogPage.totalCount);
  if (!catalogPage.item) {
    console.log("item: yo'q");
  } else {
    console.log("--- item keys ---");
    console.log(keyTree(catalogPage.item, "product").join("\n"));
    console.log("--- interesting values ---");
    const hits = interestingValues(catalogPage.item, "product");
    console.log(hits.length ? hits.join("\n") : "(rx/atc/mnn/pharm maydonlari topilmadi)");
  }

  const stock = await get("/stock", { pageSize: 1, page: 1, onlyInStock: false });
  const stockPage = firstItem(stock);
  console.log("\n=== STOCK /stock pageSize=1 ===");
  console.log("rootKeys:", stockPage.rootKeys.join(", "));
  if (stockPage.nestedKeys.length) console.log("nestedKeys:", stockPage.nestedKeys.join(", "));
  console.log("totalCount:", stockPage.totalCount);
  if (!stockPage.item) {
    console.log("item: yo'q");
  } else {
    console.log("--- item keys ---");
    console.log(keyTree(stockPage.item, "lot").join("\n"));
    console.log("--- interesting values ---");
    const hits = interestingValues(stockPage.item, "lot");
    console.log(hits.length ? hits.join("\n") : "(rx/atc/mnn/pharm maydonlari topilmadi)");
  }

  const sample = await get("/catalog/products", { pageSize: 500, page: 1 });
  const sampleItems = sample?.items || [];
  const stats = { n: sampleItems.length, atx: 0, mnn: 0, pharmGroup: 0, rxLikeKeys: new Set() };
  const examples = [];
  for (const item of sampleItems) {
    if (item?.atx) stats.atx += 1;
    if (item?.mnn) stats.mnn += 1;
    if (item?.pharmGroup) stats.pharmGroup += 1;
    for (const key of Object.keys(item || {})) {
      if (INTERESTING.test(key)) stats.rxLikeKeys.add(key);
    }
    if (examples.length < 8 && (item?.atx || item?.mnn || item?.pharmGroup)) {
      examples.push({
        id: item.id,
        atx: item.atx ?? null,
        mnn: item.mnn ? String(item.mnn).slice(0, 80) : null,
        pharmGroup: item.pharmGroup ? String(item.pharmGroup).slice(0, 80) : null,
        form: item.form || null,
      });
    }
  }
  console.log("\n=== CATALOG SAMPLE pageSize=500 page=1 ===");
  console.log(JSON.stringify({ ...stats, rxLikeKeys: [...stats.rxLikeKeys] }));
  console.log("filled examples:", JSON.stringify(examples, null, 2));

  const stockSample = await get("/stock", { pageSize: 100, page: 1, onlyInStock: false });
  const stockItems = stockSample?.items || [];
  const stockKeys = new Set();
  for (const item of stockItems) Object.keys(item || {}).forEach((key) => stockKeys.add(key));
  console.log("\n=== STOCK SAMPLE keys (100) ===");
  console.log([...stockKeys].sort().join(", "));

  const productId = catalogPage.item?.id || stockPage.item?.drugId;
  if (productId) {
    try {
      const detail = await get(`/catalog/products/${productId}`);
      const body = detail?.data && !Array.isArray(detail.data) ? detail.data : detail;
      console.log(`\n=== CATALOG DETAIL /catalog/products/${productId} ===`);
      console.log(keyTree(body, "detail").join("\n"));
      const hits = interestingValues(body, "detail");
      console.log("--- interesting values ---");
      console.log(hits.length ? hits.join("\n") : "(rx/atc/mnn/pharm maydonlari topilmadi)");
    } catch (error) {
      console.log(`\nDETAIL xato: ${error.response?.status || ""} ${error.message}`);
    }
  }
}

main().catch((error) => {
  const status = error.response?.status;
  console.error("DUMP_FAIL", status || "", error.message);
  process.exit(1);
});
