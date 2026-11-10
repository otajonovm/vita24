/**
 * Lekko dorilarini MPA reyestriga moslashtiradi va retsept belgisini qo'llaydi.
 *
 *   npm run rx:match                 # dry-run (sukut)
 *   npm run rx:match -- --dry-run
 *   npm run rx:match -- --apply
 *   npm run rx:match -- --limit 100
 *
 * Ustuvorlik: MANUAL > REGISTRY > RULE > DEFAULT
 * Moslashmagan / ishonchsiz → isPrescription=true, rxSource=DEFAULT, rxNeedsReview=true
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");
const { classifyMedicine } = require("../src/data/rxRules");
const {
  normalizeDrugText,
  pickBestMatch,
  AUTO_MIN,
  REVIEW_MIN,
} = require("../src/lib/drugMatch");
const { resolveRegistryPrescriptionWrite } = require("../src/lib/rxApply");

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function loadRegistryIndex() {
  const rows = await prisma.registryDrug.findMany({
    select: {
      id: true,
      mpaId: true,
      shortName: true,
      fullName: true,
      mnn: true,
      dosageForm: true,
      strength: true,
      manufacturer: true,
      isPrescription: true,
      dispensingConditions: true,
      normalizedName: true,
      imgUrls: true,
    },
  });

  const byNorm = new Map();
  const byMnn = new Map();
  for (const row of rows) {
    const key = row.normalizedName || normalizeDrugText(row.shortName);
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(row);
    const mnn = normalizeDrugText(row.mnn || "");
    if (mnn) {
      if (!byMnn.has(mnn)) byMnn.set(mnn, []);
      byMnn.get(mnn).push(row);
    }
  }
  return { rows, byNorm, byMnn };
}

function candidatePool(medicine, index) {
  const nameKey = normalizeDrugText(medicine.name);
  const mnnKey = normalizeDrugText(medicine.activeIngredient || "");
  const pool = new Map();
  for (const row of index.byNorm.get(nameKey) || []) pool.set(row.id, row);
  // qisman nom
  const first = nameKey.split(" ")[0];
  if (first && first.length >= 4) {
    for (const [key, list] of index.byNorm) {
      if (key.includes(first) || first.includes(key.split(" ")[0] || "")) {
        for (const row of list) pool.set(row.id, row);
      }
    }
  }
  if (mnnKey) {
    for (const row of index.byMnn.get(mnnKey) || []) pool.set(row.id, row);
  }
  // pool juda katta bo'lsa — to'liq skan o'rniga birinchi 400
  const list = [...pool.values()];
  if (list.length > 0) return list.slice(0, 500);
  // oxirgi chora: barcha qatorlar ichidan birinchi so'z bo'yicha filtr
  if (!first || first.length < 3) return [];
  return index.rows.filter((row) => (row.normalizedName || "").includes(first)).slice(0, 400);
}

async function main() {
  const apply = hasFlag("--apply") && !hasFlag("--dry-run");
  const limit = Number(argValue("--limit") || 0) || null;

  const medicines = await prisma.medicine.findMany({
    orderBy: { name: "asc" },
    take: limit || undefined,
    select: {
      id: true,
      name: true,
      dosageForm: true,
      dosage: true,
      manufacturer: true,
      activeIngredient: true,
      searchText: true,
      atcCode: true,
      isPrescription: true,
      rxSource: true,
      rxNeedsReview: true,
      registryDrugId: true,
      matchScore: true,
      matchStatus: true,
      imageUrl: true,
      imageSource: true,
      category: { select: { slug: true } },
    },
  });

  console.log(`registry index...`);
  const index = await loadRegistryIndex();
  console.log(`registry=${index.rows.length} medicines=${medicines.length}`);

  const report = [];
  const stats = {
    mode: apply ? "apply" : "dry-run",
    total: medicines.length,
    auto: 0,
    review: 0,
    none: 0,
    rxTrue: 0,
    rxFalse: 0,
    defaultReview: 0,
    keptManual: 0,
    rule: 0,
    registry: 0,
    withImageCandidate: 0,
  };

  for (const medicine of medicines) {
    const candidates = candidatePool(medicine, index);
    const best = pickBestMatch(medicine, candidates);
    const ruleClassified = classifyMedicine(medicine);
    const decision = resolveRegistryPrescriptionWrite({
      existing: medicine,
      match: best,
      registryDrug: best.candidate,
      ruleClassified,
      categorySlug: medicine.category?.slug,
    });

    if (best.matchStatus === "AUTO") stats.auto += 1;
    else if (best.matchStatus === "REVIEW") stats.review += 1;
    else stats.none += 1;

    if (decision.kept === "MANUAL") stats.keptManual += 1;
    if (decision.write) {
      if (decision.rxSource === "REGISTRY") stats.registry += 1;
      if (decision.rxSource === "RULE") stats.rule += 1;
      if (decision.rxSource === "DEFAULT") stats.defaultReview += 1;
      if (decision.isPrescription) stats.rxTrue += 1;
      else stats.rxFalse += 1;
    }

    const hasImg =
      best.candidate &&
      Array.isArray(best.candidate.imgUrls) &&
      best.candidate.imgUrls.length > 0;
    if (hasImg) stats.withImageCandidate += 1;

    const matchStatus =
      medicine.matchStatus === "CONFIRMED" || medicine.matchStatus === "REJECTED"
        ? medicine.matchStatus
        : best.matchStatus;

    const row = {
      id: medicine.id,
      name: medicine.name,
      dosageForm: medicine.dosageForm,
      matchStatus,
      matchScore: best.score,
      mpaId: best.candidate?.mpaId || "",
      mpaName: best.candidate?.shortName || "",
      mpaForm: best.candidate?.dosageForm || "",
      mpaStrength: best.candidate?.strength || "",
      mpaMaker: best.candidate?.manufacturer || "",
      mpaRx: best.candidate ? Boolean(best.candidate.isPrescription) : "",
      decisionRx: decision.write ? decision.isPrescription : medicine.isPrescription,
      decisionSource: decision.write ? decision.rxSource : medicine.rxSource,
      decisionReview: decision.write ? decision.rxNeedsReview : medicine.rxNeedsReview,
      reason: decision.reason || decision.kept || "",
      keptManual: decision.kept === "MANUAL",
    };
    report.push(row);

    if (!apply) continue;

    const data = {
      matchScore: best.score || null,
      matchStatus,
      registryDrugId:
        matchStatus === "REJECTED"
          ? null
          : best.candidate?.id || null,
    };

    if (decision.write) {
      data.isPrescription = decision.isPrescription;
      data.rxSource = decision.rxSource;
      data.rxNeedsReview = decision.rxNeedsReview;
    }

    await prisma.medicine.update({ where: { id: medicine.id }, data });
  }

  const dir = path.join(__dirname, "..", "tmp");
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, "rx-match-report.json");
  const csvPath = path.join(dir, "rx-match-report.csv");
  fs.writeFileSync(jsonPath, JSON.stringify({ stats, thresholds: { AUTO_MIN, REVIEW_MIN }, report }, null, 2), "utf8");

  const headers = [
    "id",
    "name",
    "dosageForm",
    "matchStatus",
    "matchScore",
    "mpaId",
    "mpaName",
    "mpaForm",
    "mpaStrength",
    "mpaMaker",
    "mpaRx",
    "decisionRx",
    "decisionSource",
    "decisionReview",
    "reason",
    "keptManual",
  ];
  const lines = [headers.join(",")];
  for (const row of report) {
    lines.push(headers.map((key) => csvCell(row[key])).join(","));
  }
  fs.writeFileSync(csvPath, `${lines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({ ...stats, jsonPath, csvPath }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
