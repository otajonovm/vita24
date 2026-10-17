/**
 * Mavjud Prescription.fileUrl dagi data: URL larni yopiq papkaga ko'chiradi.
 * Ishlatish: node scripts/migratePrescriptionFiles.js
 */
require("dotenv").config();
const fs = require("fs");
const prisma = require("../src/lib/prisma");
const { isStorageKey, savePrescriptionBuffer } = require("../src/lib/prescriptionFiles");

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

async function main() {
  const rows = await prisma.prescription.findMany({
    select: { id: true, fileUrl: true },
  });

  let moved = 0;
  let skipped = 0;

  for (const row of rows) {
    if (isStorageKey(row.fileUrl)) {
      skipped += 1;
      continue;
    }
    const parsed = parseDataUrl(row.fileUrl);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    const fileKey = savePrescriptionBuffer({ buffer: parsed.buffer, mimetype: parsed.mime });
    await prisma.prescription.update({
      where: { id: row.id },
      data: { fileUrl: fileKey },
    });
    moved += 1;
  }

  console.log(`[prescriptions] ko'chirildi: ${moved}, o'tkazildi: ${skipped}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
