/**
 * Mavjud dorilarga retsept qoidalarini qo'llaydi.
 * MANUAL va LEKKO manbalariga tegmaydi.
 *
 *   npm run rx:backfill -- --dry-run
 *   npm run rx:backfill -- --apply
 *
 * --dry-run (sukut) CSV yozadi va bazani o'zgartirmaydi.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");
const { classifyMedicine } = require("../src/data/rxRules");

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function main() {
  const apply = process.argv.includes("--apply") && !process.argv.includes("--dry-run");
  const rows = await prisma.medicine.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
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

  const rxLines = [["id", "name", "dosageForm", "activeIngredient", "atcCode", "reason", "rxSourceBefore"]];
  const updates = [];
  let rx = 0;
  let review = 0;
  let skippedManual = 0;
  let skippedLekko = 0;

  for (const row of rows) {
    if (row.rxSource === "MANUAL") {
      skippedManual += 1;
      continue;
    }
    if (row.rxSource === "LEKKO") {
      skippedLekko += 1;
      continue;
    }
    const classified = classifyMedicine(row);
    if (classified.isPrescription === true) {
      rx += 1;
      rxLines.push([
        row.id,
        row.name,
        row.dosageForm,
        row.activeIngredient || "",
        row.atcCode || "",
        classified.reason,
        row.rxSource || "",
      ]);
      const same = row.isPrescription === true && row.rxSource === "RULE" && row.rxNeedsReview === false;
      if (!same) {
        updates.push({
          id: row.id,
          data: { isPrescription: true, rxSource: "RULE", rxNeedsReview: false },
        });
      }
      continue;
    }
    if (classified.rxNeedsReview) {
      review += 1;
      const data = {};
      if (!row.rxNeedsReview) data.rxNeedsReview = true;
      if (row.rxSource === "RULE") {
        data.isPrescription = false;
        data.rxSource = null;
        data.rxNeedsReview = true;
      }
      if (Object.keys(data).length) updates.push({ id: row.id, data });
      continue;
    }
    if (row.rxSource === "RULE") {
      updates.push({
        id: row.id,
        data: { isPrescription: false, rxSource: null, rxNeedsReview: false },
      });
    }
  }

  const dir = path.join(__dirname, "..", "tmp");
  fs.mkdirSync(dir, { recursive: true });
  const csv = path.join(dir, "rx-backfill.csv");
  fs.writeFileSync(csv, `${rxLines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        total: rows.length,
        rx,
        review,
        skippedManual,
        skippedLekko,
        toWrite: updates.length,
        csv,
      },
      null,
      2
    )
  );

  if (apply) {
    for (const item of updates) {
      await prisma.medicine.update({ where: { id: item.id }, data: item.data });
    }
    console.log(`yozildi: ${updates.length}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
