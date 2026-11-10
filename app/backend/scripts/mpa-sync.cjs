/**
 * MPA dori reyestrini RegistryDrug ga yuklaydi.
 *
 *   npm run mpa:sync -- --dry-run
 *   npm run mpa:sync -- --limit 200
 *   npm run mpa:sync -- --page 10
 *   npm run mpa:sync -- --resume
 *
 * Tafsilot (/drugs/{id}) bu skriptda chaqirilmaydi — faqat search.
 * Rasm tafsiloti mpa:images da, faqat moslashgan dorilar uchun.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");
const { normalizeDrugText } = require("../src/lib/drugMatch");
const { searchDrugs } = require("../src/services/mpaClient");

const STATE_FILE = path.join(__dirname, "..", "tmp", "mpa-sync-state.json");

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { page: 0 };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function upsertRow(row, dryRun) {
  const normalizedName = normalizeDrugText(row.shortName || row.fullName);
  const data = {
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
    normalizedName,
    fetchedAt: new Date(),
  };
  if (dryRun) return { action: "dry" };
  await prisma.registryDrug.upsert({
    where: { mpaId: row.mpaId },
    create: { mpaId: row.mpaId, ...data },
    update: data,
  });
  return { action: "upsert" };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const limit = Number(argValue("--limit") || 0) || null;
  const size = Number(argValue("--size") || 50) || 50;
  const resume = hasFlag("--resume");
  let page = Number(argValue("--page") || (resume ? loadState().page : 0)) || 0;

  let upserted = 0;
  let fetched = 0;
  let pages = 0;
  let prescription = 0;

  console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "apply", page, size, limit }, null, 2));

  while (true) {
    if (limit && fetched >= limit) break;
    const result = await searchDrugs({ page, size });
    pages += 1;
    if (!result.items.length) {
      console.log(`page=${page} empty — stop`);
      break;
    }

    for (const row of result.items) {
      if (limit && fetched >= limit) break;
      await upsertRow(row, dryRun);
      fetched += 1;
      upserted += 1;
      if (row.isPrescription) prescription += 1;
    }

    saveState({ page: page + 1, at: new Date().toISOString(), fetched });
    console.log(
      `page=${page} items=${result.items.length} totalFetched=${fetched} hasNext=${result.hasNext} rx=${prescription}`
    );

    if (!result.hasNext) break;
    page += 1;
  }

  const summary = {
    mode: dryRun ? "dry-run" : "apply",
    pages,
    fetched,
    upserted,
    prescription,
    nextPage: page,
    stateFile: STATE_FILE,
  };
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
