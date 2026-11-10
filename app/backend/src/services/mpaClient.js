const axios = require("axios");

const MPA_API_BASE = process.env.MPA_API_BASE || "https://api.pharmagency.uz/drug-catalog-api/v2";
const MPA_FILE_BASE = process.env.MPA_FILE_BASE || "https://api.mpa.uz/file-api/v1/drugs";
const MPA_TIMEOUT_MS = Number(process.env.MPA_TIMEOUT_MS || 20_000);
const MPA_DELAY_MS = Number(process.env.MPA_DELAY_MS || 400);
const MPA_MAX_RETRIES = Number(process.env.MPA_MAX_RETRIES || 3);

const client = axios.create({
  baseURL: MPA_API_BASE.replace(/\/$/, ""),
  timeout: MPA_TIMEOUT_MS,
  headers: { Accept: "application/json" },
  validateStatus: (status) => status >= 200 && status < 300,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function isRetryable(error) {
  const status = error.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT" || error.code === "ECONNRESET") return true;
  if (!error.response) return true;
  return false;
}

function backoffMs(attempt, error) {
  const retryAfter = error.response?.headers?.["retry-after"];
  if (retryAfter != null && retryAfter !== "") {
    const asNumber = Number(retryAfter);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return asNumber > 1000 ? asNumber : asNumber * 1000;
    }
  }
  return Math.min(8_000, MPA_DELAY_MS * 2 ** attempt) + Math.floor(Math.random() * 200);
}

async function mpaRequest(fn, attempt = 0) {
  try {
    return await fn();
  } catch (error) {
    if (attempt < MPA_MAX_RETRIES && isRetryable(error)) {
      const wait = backoffMs(attempt, error);
      await sleep(wait);
      return mpaRequest(fn, attempt + 1);
    }
    throw error;
  }
}

function mapSearchHit(row) {
  const dispensing = String(row.dispensingConditions || "").trim();
  const prescriptionRequired =
    row.prescriptionRequired === true ||
    row.isAvailableWithoutPrescription === false ||
    /retsipl|рецепт/i.test(dispensing);

  return {
    mpaId: String(row.drugId || row.id || ""),
    shortName: String(row.shortName || row.name || "").trim(),
    fullName: String(row.fullName || row.shortName || row.name || "").trim(),
    mnn: row.mnn ? String(row.mnn).trim() : null,
    dosageForm: row.dosageForm ? String(row.dosageForm).trim() : null,
    strength: row.strength ? String(row.strength).trim() : null,
    manufacturer: row.manufacturer ? String(row.manufacturer).trim() : null,
    country: row.country ? String(row.country).trim() : null,
    registrationCode: row.registrationCode ? String(row.registrationCode).trim() : null,
    atxCode: row.atxCode || row.atcCode ? String(row.atxCode || row.atcCode).trim() : null,
    isPrescription: Boolean(prescriptionRequired),
    dispensingConditions: dispensing || null,
    imgUrls: Array.isArray(row.imgUrls) ? row.imgUrls : null,
  };
}

async function searchDrugs({ name = "", page = 0, size = 50 } = {}) {
  await sleep(MPA_DELAY_MS);
  const data = await mpaRequest(async () => {
    const response = await client.get("/drugs/portal/search", {
      params: {
        ...(name ? { name } : {}),
        page,
        size,
      },
    });
    return response.data;
  });

  const root = data?.result || data?.data || data || {};
  const content = root.content || root.items || root.results || (Array.isArray(root) ? root : []);
  const totalPages =
    root.totalPages ??
    root.page?.totalPages ??
    (root.totalElements != null && size ? Math.ceil(Number(root.totalElements) / size) : null);
  const last = root.last === true || (totalPages != null && page >= Number(totalPages) - 1);
  const items = (Array.isArray(content) ? content : []).map(mapSearchHit).filter((row) => row.mpaId);

  return {
    items,
    page,
    size,
    totalPages: totalPages == null ? null : Number(totalPages),
    hasNext: !last && items.length >= size,
    raw: data,
  };
}

async function getDrugDetail(mpaId) {
  await sleep(MPA_DELAY_MS);
  const data = await mpaRequest(async () => {
    const response = await client.get(`/drugs/${encodeURIComponent(mpaId)}`);
    return response.data;
  });
  const result = data?.result || data?.data || data || {};
  const imgUrls = Array.isArray(result.imgUrls) ? result.imgUrls : [];
  return {
    id: String(result.id || mpaId),
    inn: result.inn || null,
    atcCode: result.atcCode || result.atxCode || null,
    registrationNumber: result.registrationNumber || null,
    hasPrescription: result.hasPrescription === true,
    imgUrls: imgUrls.map((item) => ({
      url: String(item.url || "").trim(),
      side: String(item.side || "").trim() || null,
    })),
    substanceNames: result.substanceNames || null,
    raw: result,
  };
}

function fileUrlFromUuid(uuidOrUrl) {
  const value = String(uuidOrUrl || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const id = value.replace(/\.jpe?g$/i, "");
  return `${MPA_FILE_BASE.replace(/\/$/, "")}/${id}.jpg`;
}

/**
 * MPA file API: HEAD often returns 401; existence must be checked with GET.
 * Do not call HEAD for availability.
 */
async function downloadDrugImage(uuidOrUrl) {
  const url = fileUrlFromUuid(uuidOrUrl);
  if (!url) throw new Error("Rasm URL bo'sh");
  await sleep(MPA_DELAY_MS);
  const response = await mpaRequest(async () =>
    axios.get(url, {
      responseType: "arraybuffer",
      timeout: MPA_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 300,
      headers: { Accept: "image/jpeg,image/*,*/*" },
    })
  );
  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  const buffer = Buffer.from(response.data);
  return { url, buffer, contentType, size: buffer.length };
}

module.exports = {
  MPA_API_BASE,
  MPA_FILE_BASE,
  MPA_DELAY_MS,
  searchDrugs,
  getDrugDetail,
  downloadDrugImage,
  fileUrlFromUuid,
  mapSearchHit,
  sleep,
};
