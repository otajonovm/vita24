#!/usr/bin/env node
/**
 * Idempotent category taxonomy upsert + medicine reclassification.
 *
 *   node scripts/classify-categories.cjs --dry-run
 *   node scripts/classify-categories.cjs --dry-run --csv=/tmp/category-assign.csv
 *   node scripts/classify-categories.cjs --dry-run --branchId=76ef5c19-...
 *   node scripts/classify-categories.cjs --apply
 *   node scripts/classify-categories.cjs --apply --force
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");
const { CATEGORIES, isJunkCategory } = require("../src/lib/categoryCatalog");
const { classifyMedicine, buildSynonymIndex, FALLBACK_SLUG } = require("../src/lib/categoryClassify");

function parseArgs(argv) {
  const flags = {
    dryRun: true,
    apply: false,
    force: false,
    csv: "",
    branchId: "",
  };
  for (const arg of argv) {
    if (arg === "--apply") {
      flags.apply = true;
      flags.dryRun = false;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
      flags.apply = false;
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg.startsWith("--csv=")) {
      flags.csv = arg.slice("--csv=".length);
    } else if (arg.startsWith("--branchId=")) {
      flags.branchId = arg.slice("--branchId=".length).trim();
    }
  }
  return flags;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function upsertCategories(tx) {
  const bySlug = new Map();
  const existing = await tx.category.findMany();
  const usedIds = new Set();

  for (const def of CATEGORIES) {
    let row =
      existing.find((item) => item.slug === def.slug) ||
      existing.find((item) => def.legacyIds.includes(item.id)) ||
      existing.find((item) => def.legacySlugs.includes(item.slug));

    const data = {
      name: def.name,
      nameUz: def.nameUz,
      nameUzCyrl: def.nameUzCyrl,
      nameRu: def.nameRu,
      slug: def.slug,
      icon: def.icon,
      sortOrder: def.sortOrder,
    };

    if (row) {
      if (usedIds.has(row.id)) {
        row = null;
      } else {
        row = await tx.category.update({ where: { id: row.id }, data });
        usedIds.add(row.id);
      }
    }

    if (!row) {
      row = await tx.category.create({ data });
      usedIds.add(row.id);
    }

    bySlug.set(def.slug, row);
  }

  return bySlug;
}

function medicineWhere(branchId) {
  if (!branchId) return {};
  return {
    stocks: {
      some: {
        branchId,
        OR: [{ stockCount: { gt: 0 } }, { reservedCount: { gt: 0 } }, { price: { gt: 0 } }],
      },
    },
  };
}

async function loadSynonymIndex() {
  const rows = await prisma.searchSynonym.findMany({
    select: { term: true, canonical: true, type: true },
  });
  return buildSynonymIndex(rows);
}

async function cleanupJunkCategories(tx, keepIds) {
  const all = await tx.category.findMany({
    include: { _count: { select: { medicines: true } } },
  });
  let deleted = 0;
  for (const category of all) {
    if (keepIds.has(category.id)) continue;
    if (!isJunkCategory(category) && category._count.medicines > 0) continue;
    if (category._count.medicines > 0) continue;
    await tx.category.delete({ where: { id: category.id } });
    deleted += 1;
  }
  return deleted;
}

async function resolveCategoryMap(apply) {
  if (apply) {
    return prisma.$transaction((tx) => upsertCategories(tx));
  }
  const existing = await prisma.category.findMany();
  const bySlug = new Map();
  for (const def of CATEGORIES) {
    const row =
      existing.find((item) => item.slug === def.slug) ||
      existing.find((item) => def.legacyIds.includes(item.id)) ||
      existing.find((item) => def.legacySlugs.includes(item.slug)) || {
        id: `planned:${def.slug}`,
        slug: def.slug,
        name: def.name,
      };
    bySlug.set(def.slug, row);
  }
  return bySlug;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const synonymIndex = await loadSynonymIndex();

  const bySlug = await resolveCategoryMap(flags.apply);
  const keepIds = new Set(
    [...bySlug.values()].filter((item) => !String(item.id).startsWith("planned:")).map((item) => item.id)
  );
  const slugById = new Map([...bySlug.values()].map((item) => [item.id, item.slug]));

  const medicines = await prisma.medicine.findMany({
    where: medicineWhere(flags.branchId),
    select: {
      id: true,
      name: true,
      dosageForm: true,
      activeIngredient: true,
      atcCode: true,
      searchText: true,
      categoryId: true,
      categorySource: true,
      category: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { name: "asc" },
  });

  const counts = Object.fromEntries(CATEGORIES.map((item) => [item.slug, 0]));
  const reasonCounts = {};
  const changes = [];
  let skippedManual = 0;
  let unchanged = 0;
  let wouldUpdate = 0;

  for (const medicine of medicines) {
    const source = medicine.categorySource || "AUTO";
    if (!flags.force && (source === "MANUAL" || source === "IMPORT")) {
      skippedManual += 1;
      const currentSlug = medicine.category?.slug || slugById.get(medicine.categoryId) || FALLBACK_SLUG;
      counts[currentSlug] = (counts[currentSlug] || 0) + 1;
      continue;
    }

    const hit = classifyMedicine(medicine, { synonymIndex });
    const target = bySlug.get(hit.slug) || bySlug.get(FALLBACK_SLUG);
    const targetSlug = hit.slug || target.slug || FALLBACK_SLUG;
    counts[targetSlug] = (counts[targetSlug] || 0) + 1;
    reasonCounts[hit.reason] = (reasonCounts[hit.reason] || 0) + 1;

    const needsUpdate =
      medicine.categoryId !== target.id ||
      source !== "AUTO" ||
      isJunkCategory(medicine.category) ||
      medicine.category?.slug !== targetSlug;

    const row = {
      medicineId: medicine.id,
      name: medicine.name,
      fromCategory: medicine.category?.slug || medicine.category?.name || "",
      toCategory: targetSlug,
      reason: hit.reason,
      matchedRule: hit.matchedRule,
      categorySource: source,
      action: needsUpdate ? "update" : "keep",
    };

    if (!needsUpdate) {
      unchanged += 1;
    } else {
      wouldUpdate += 1;
      changes.push(row);
    }
  }

  const total = medicines.length || 1;
  console.log(`\nMode: ${flags.apply ? "APPLY" : "DRY-RUN"}${flags.force ? " --force" : ""}`);
  if (flags.branchId) console.log(`Branch filter: ${flags.branchId}`);
  console.log(`Medicines scanned: ${medicines.length}`);
  console.log(`Would update: ${wouldUpdate} | Unchanged: ${unchanged} | Skipped MANUAL/IMPORT: ${skippedManual}`);
  console.log("\nBy category:");
  const table = CATEGORIES.map((item) => {
    const count = counts[item.slug] || 0;
    const pct = ((count / total) * 100).toFixed(1);
    return { slug: item.slug, count, pct: `${pct}%` };
  });
  console.table(table);
  console.log("Reasons:", reasonCounts);
  const otherPct = (((counts[FALLBACK_SLUG] || 0) / total) * 100).toFixed(2);
  console.log(`Boshqa: ${counts[FALLBACK_SLUG] || 0} (${otherPct}%)`);

  if (flags.csv) {
    const abs = path.resolve(flags.csv);
    const header = "medicineId,name,fromCategory,toCategory,reason,matchedRule,categorySource,action";
    const lines = [header];
    for (const row of changes) {
      lines.push(
        [
          row.medicineId,
          row.name,
          row.fromCategory,
          row.toCategory,
          row.reason,
          row.matchedRule,
          row.categorySource,
          row.action,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    // also dump unmatched / boshqa for review even if already in that category
    for (const medicine of medicines) {
      const hit = classifyMedicine(medicine, { synonymIndex });
      if (hit.slug !== FALLBACK_SLUG) continue;
      if (changes.some((row) => row.medicineId === medicine.id)) continue;
      lines.push(
        [
          medicine.id,
          medicine.name,
          medicine.category?.slug || "",
          FALLBACK_SLUG,
          hit.reason,
          hit.matchedRule,
          medicine.categorySource || "AUTO",
          "review",
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    fs.writeFileSync(abs, `${lines.join("\n")}\n`, "utf8");
    console.log(`CSV written: ${abs} (${lines.length - 1} rows)`);
  }

  if (!flags.apply) {
    console.log("\nDry-run only. Re-run with --apply after review.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  const batchSize = 100;
  for (let i = 0; i < changes.length; i += batchSize) {
    const slice = changes.slice(i, i + batchSize);
    await prisma.$transaction(async (tx) => {
      for (const row of slice) {
        const target = bySlug.get(row.toCategory);
        await tx.medicine.update({
          where: { id: row.medicineId },
          data: { categoryId: target.id, categorySource: "AUTO" },
        });
        updated += 1;
      }
    });
  }

  const deleted = await prisma.$transaction((tx) => cleanupJunkCategories(tx, keepIds));
  console.log(`\nApplied updates: ${updated}`);
  console.log(`Deleted empty junk categories: ${deleted}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
