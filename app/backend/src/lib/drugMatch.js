/**
 * Lekko ↔ MPA dori moslashuvi.
 *
 * Ball chegaralari (0–100):
 *   AUTO_MIN   (≥ 78) — avtomatik tasdiq (matchStatus=AUTO)
 *   REVIEW_MIN (≥ 55) — admin ko‘rigi (matchStatus=REVIEW)
 *   undan past — moslashmagan (NONE)
 *
 * Nom + MNN + shakl + doza + ishlab chiqaruvchi solishtiriladi.
 * Bir xil MNN turli shakllarda retsept holati farq qilishi mumkin —
 * shakl/doza balli shuning uchun majburiy.
 */

const { toLatin, normalizeSearch } = require("./searchText");

const AUTO_MIN = 78;
const REVIEW_MIN = 55;

const FORM_ALIASES = [
  ["tabletka", ["tab", "tabl", "tablet", "tabletka", "таблет", "таб"]],
  ["kapsula", ["kap", "kaps", "capsule", "kapsula", "капс", "капсул"]],
  ["sirop", ["sirop", "syrup", "сироп"]],
  ["inyeksiya", ["inj", "amp", "ampula", "inyeksiya", "injection", "инъекц", "ампул", "р-р", "раствор"]],
  ["infuziya", ["infuz", "infusion", "инфуз", "flakon", "флакон"]],
  ["malham", ["malham", "ointment", "krem", "cream", "gel", "маз", "крем", "гель"]],
  ["sprey", ["sprey", "spray", "спрей"]],
  ["tomchi", ["tomchi", "drop", "капли", "кап"]],
  ["poroshok", ["poroshok", "powder", "порош"]],
  ["suppozitoriya", ["supp", "свеч", "суппоз"]],
];

function normalizeDrugText(value) {
  return normalizeSearch(
    toLatin(String(value || ""))
      .toLowerCase()
      .replace(/№\s*\d+/gi, " ")
      .replace(/\bn\s*°?\s*\d+/gi, " ")
      .replace(/\b\d+\s*(mg|мg|мг|ml|мл|g|г|mcg|мкг|iu|ме|%)\b/gi, " ")
      .replace(/\b(tab|tabl|tabletka|kaps|kapsula|sirop|amp|ampula|krem|gel|sprey|tomchi|poroshok)\.?\b/gi, " ")
  );
}

function extractStrength(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(",", ".")
    .replace(/миллиграмм(?:а|ов)?/gi, "mg")
    .replace(/миллилитр(?:а|ов)?/gi, "ml")
    .replace(/микрограмм(?:а|ов)?/gi, "mcg");
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(mg|мg|мг|ml|мл|g|г|mcg|мкг|iu|ме|%)/gi)];
  return matches
    .map((m) => {
      const unit = String(m[2] || "")
        .toLowerCase()
        .replace("мг", "mg")
        .replace("мл", "ml")
        .replace("г", "g")
        .replace("мкг", "mcg")
        .replace("ме", "iu");
      return `${m[1]}${unit}`;
    })
    .join(" ");
}

function normalizeForm(value) {
  const raw = String(value || "").trim();
  if (!raw || /^noma['’`]?lum$/i.test(raw) || /^неизвестно$/i.test(raw) || raw === "-") {
    return "";
  }
  const text = toLatin(raw).toLowerCase();
  for (const [canonical, aliases] of FORM_ALIASES) {
    if (aliases.some((alias) => text.includes(alias))) return canonical;
  }
  return normalizeSearch(text).slice(0, 40);
}

function resolveForm(medicineOrRegistry) {
  const direct = normalizeForm(medicineOrRegistry?.dosageForm);
  if (direct) return direct;
  const fromName = normalizeForm(
    `${medicineOrRegistry?.name || ""} ${medicineOrRegistry?.shortName || ""} ${medicineOrRegistry?.fullName || ""}`
  );
  return fromName;
}

function tokenSet(value) {
  return new Set(
    String(value || "")
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
  );
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const item of a) if (b.has(item)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function includesScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return jaccard(tokenSet(a), tokenSet(b));
}

function scoreMedicineAgainstRegistry(medicine, registry) {
  const medName = normalizeDrugText(medicine.name);
  const regName = normalizeDrugText(registry.shortName || registry.fullName || registry.normalizedName);
  const nameScore = includesScore(medName, regName);

  const medMnn = normalizeDrugText(medicine.activeIngredient || medicine.mnn || "");
  const regMnn = normalizeDrugText(registry.mnn || "");
  let mnnScore = 0.5;
  if (medMnn && regMnn) mnnScore = includesScore(medMnn, regMnn);
  else if (!medMnn && !regMnn) mnnScore = 0.6;

  const medForm = resolveForm(medicine);
  const regForm = resolveForm(registry);
  let formScore = 0.45;
  if (medForm && regForm) formScore = medForm === regForm ? 1 : includesScore(medForm, regForm) * 0.7;

  const medStrength = extractStrength(`${medicine.dosage || ""} ${medicine.name || ""}`);
  const regStrength = extractStrength(`${registry.strength || ""} ${registry.fullName || ""} ${registry.shortName || ""}`);
  let strengthScore = 0.5;
  if (medStrength && regStrength) {
    strengthScore = medStrength === regStrength || medStrength.includes(regStrength) || regStrength.includes(medStrength)
      ? 1
      : includesScore(medStrength, regStrength);
  }

  const medMaker = normalizeDrugText(medicine.manufacturer);
  const regMaker = normalizeDrugText(registry.manufacturer);
  let makerScore = 0.55;
  if (medMaker && regMaker) makerScore = includesScore(medMaker, regMaker);

  // Nom eng muhim; shakl/doza — retsept farqi uchun; MNN/maker mustahkamlaydi.
  const score =
    nameScore * 40 +
    mnnScore * 20 +
    formScore * 20 +
    strengthScore * 12 +
    makerScore * 8;

  return Math.round(score * 10) / 10;
}

function matchStatusForScore(score) {
  if (score >= AUTO_MIN) return "AUTO";
  if (score >= REVIEW_MIN) return "REVIEW";
  return "NONE";
}

function pickBestMatch(medicine, candidates) {
  let best = null;
  for (const candidate of candidates || []) {
    const score = scoreMedicineAgainstRegistry(medicine, candidate);
    if (!best || score > best.score) {
      best = { candidate, score, matchStatus: matchStatusForScore(score) };
    }
  }
  if (!best || best.matchStatus === "NONE") {
    return { candidate: null, score: best?.score || 0, matchStatus: "NONE" };
  }
  return best;
}

module.exports = {
  AUTO_MIN,
  REVIEW_MIN,
  normalizeDrugText,
  extractStrength,
  normalizeForm,
  resolveForm,
  scoreMedicineAgainstRegistry,
  matchStatusForScore,
  pickBestMatch,
  FORM_ALIASES,
};
