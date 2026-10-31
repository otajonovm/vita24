const prisma = require("../src/lib/prisma");
const { buildSearchText } = require("../src/lib/searchText");
const { seedSearchSynonyms } = require("./seed-search-synonyms");

const BATCH_SIZE = 200;

async function ensureSearch(client = prisma) {
  const [emptyCount, synCount] = await Promise.all([
    client.medicine.count({ where: { searchText: "" } }),
    client.searchSynonym.count(),
  ]);

  let synonymsSeeded = 0;
  if (synCount === 0) {
    synonymsSeeded = await seedSearchSynonyms(client);
    console.log(`[ensure-search] Sinonimlar kiritildi: ${synonymsSeeded} ta`);
  }

  let backfilled = 0;
  if (emptyCount > 0) {
    console.log(`[ensure-search] Bo'sh searchText: ${emptyCount} ta dori topildi. Batch yangilash boshlanmoqda...`);
    while (true) {
      const rows = await client.medicine.findMany({
        where: { searchText: "" },
        take: BATCH_SIZE,
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          activeIngredient: true,
          manufacturer: true,
          dosageForm: true,
          description: true,
        },
      });

      if (!rows.length) break;

      await client.$transaction(
        rows.map((row) =>
          client.medicine.update({
            where: { id: row.id },
            data: { searchText: buildSearchText(row) },
          })
        )
      );

      backfilled += rows.length;
      console.log(`[ensure-search] Yangilandi: ${backfilled}/${emptyCount}`);
    }
    console.log(`[ensure-search] Jami ${backfilled} ta dori searchText bilan to'ldirildi.`);
  }

  return { emptyCount, backfilled, synonymsSeeded, synCount };
}

async function main() {
  const result = await ensureSearch();
  console.log("[ensure-search] Tayyor:", result);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error("[ensure-search] Xatolik:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
}

module.exports = { ensureSearch };

