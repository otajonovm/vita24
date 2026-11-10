/**
 * MPA rasmlarini yuklab, lokal storage ga saqlaydi (PENDING).
 *
 *   npm run mpa:images -- --dry-run
 *   npm run mpa:images -- --limit 50
 *   npm run mpa:images -- --apply
 *
 * Faqat imageSource != MANUAL va rasmsiz (yoki REGISTRY PENDING yo'q) dorilar.
 * FRONT_SIDE afzal. HEAD ishlatilmaydi — faqat GET.
 * Tafsilot endpointi faqat shu yerda (moslashgan dorilar uchun) chaqiriladi.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");
const { getDrugDetail, downloadDrugImage } = require("../src/services/mpaClient");
const { processAndStoreRegistryImage, pickPreferredImage } = require("../src/lib/mpaImageProcess");
const { removeMedicineImageByUrl } = require("../src/middlewares/upload");

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] || null;
}

async function main() {
  const apply = hasFlag("--apply") && !hasFlag("--dry-run");
  const dryRun = !apply;
  const limit = Number(argValue("--limit") || 0) || null;

  const medicines = await prisma.medicine.findMany({
    where: {
      imageSource: { not: "MANUAL" },
      OR: [
        { imageUrl: null },
        { imageUrl: "" },
        { AND: [{ imageSource: "NONE" }] },
        { AND: [{ imageSource: "REGISTRY" }, { imageStatus: { in: ["REJECTED"] } }] },
      ],
      registryDrugId: { not: null },
      matchStatus: { in: ["AUTO", "CONFIRMED", "REVIEW"] },
    },
    take: limit || undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      imageSource: true,
      imageStatus: true,
      registryDrugId: true,
      registryDrug: {
        select: { id: true, mpaId: true, imgUrls: true, shortName: true },
      },
    },
  });

  const stats = {
    mode: dryRun ? "dry-run" : "apply",
    candidates: medicines.length,
    downloaded: 0,
    skippedNoImg: 0,
    failed: 0,
    keptManual: 0,
  };
  const report = [];
  const total = medicines.length;
  console.log(JSON.stringify({ phase: "start", mode: stats.mode, candidates: total }, null, 2));

  let i = 0;
  function logProgress(extra = {}) {
    if (i === 1 || i === total || i % 10 === 0 || extra.force) {
      console.log(
        JSON.stringify({
          progress: `${i}/${total}`,
          pct: total ? Math.round((i / total) * 100) : 100,
          downloaded: stats.downloaded,
          skippedNoImg: stats.skippedNoImg,
          failed: stats.failed,
          ...extra,
        })
      );
    }
  }

  for (const medicine of medicines) {
    i += 1;
    if (medicine.imageSource === "MANUAL") {
      stats.keptManual += 1;
      logProgress({ name: medicine.name, status: "kept-manual" });
      continue;
    }

    let imgUrls = medicine.registryDrug?.imgUrls;
    try {
      const detail = await getDrugDetail(medicine.registryDrug.mpaId);
      if (detail.imgUrls?.length) {
        imgUrls = detail.imgUrls;
        if (apply) {
          const regData = { imgUrls: detail.imgUrls };
          if (detail.hasPrescription === true) regData.isPrescription = true;
          await prisma.registryDrug.update({
            where: { id: medicine.registryDrugId },
            data: regData,
          });
        }
      }
    } catch (error) {
      stats.failed += 1;
      report.push({ id: medicine.id, name: medicine.name, error: error.message || "detail-failed" });
      logProgress({ name: medicine.name, status: "detail-failed" });
      continue;
    }

    const preferred = pickPreferredImage(imgUrls);
    const alternatives = Array.isArray(imgUrls) ? imgUrls : [];
    if (!preferred?.url) {
      stats.skippedNoImg += 1;
      report.push({ id: medicine.id, name: medicine.name, status: "no-image" });
      if (apply) {
        await prisma.medicine.update({
          where: { id: medicine.id },
          data: { registryImageCandidates: alternatives, imageSource: "NONE", imageStatus: null },
        });
      }
      logProgress({ name: medicine.name, status: "no-image" });
      continue;
    }

    if (dryRun) {
      stats.downloaded += 1;
      report.push({
        id: medicine.id,
        name: medicine.name,
        status: "would-download",
        side: preferred.side,
        url: preferred.url,
        candidates: alternatives.length,
      });
      logProgress({ name: medicine.name, status: "would-download" });
      continue;
    }

    try {
      const file = await downloadDrugImage(preferred.url);
      const stored = await processAndStoreRegistryImage(medicine.id, file.buffer, file.contentType);
      const previous = medicine.imageUrl;
      await prisma.medicine.update({
        where: { id: medicine.id },
        data: {
          imageUrl: stored.imageUrl,
          imageSource: "REGISTRY",
          imageStatus: "PENDING",
          registryImageCandidates: alternatives.map((item) => ({
            url: item.url,
            side: item.side,
            selected: item.url === preferred.url,
            thumbUrl: stored.thumbUrl,
          })),
        },
      });
      if (previous && previous !== stored.imageUrl && medicine.imageSource !== "MANUAL") {
        removeMedicineImageByUrl(previous);
      }
      stats.downloaded += 1;
      report.push({ id: medicine.id, name: medicine.name, status: "saved", imageUrl: stored.imageUrl });
      logProgress({ name: medicine.name, status: "saved" });
    } catch (error) {
      stats.failed += 1;
      report.push({ id: medicine.id, name: medicine.name, error: error.message || "download-failed" });
      logProgress({ name: medicine.name, status: "download-failed" });
    }
  }

  const dir = path.join(__dirname, "..", "tmp");
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, "mpa-images-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ stats, report }, null, 2), "utf8");
  console.log(JSON.stringify({ ...stats, reportPath }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
