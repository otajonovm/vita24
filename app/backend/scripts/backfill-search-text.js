const prisma = require("../src/lib/prisma");
const { buildSearchText } = require("../src/lib/searchText");

const BATCH_SIZE = 200;

async function main() {
  const total = await prisma.medicine.count();
  let cursor = null;
  let updated = 0;

  console.log(`[backfill-search-text] Jami ${total} ta dori yangilanadi...`);

  while (true) {
    const rows = await prisma.medicine.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
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

    await prisma.$transaction(
      rows.map((row) =>
        prisma.medicine.update({
          where: { id: row.id },
          data: { searchText: buildSearchText(row) },
        })
      )
    );

    updated += rows.length;
    cursor = rows[rows.length - 1].id;
    console.log(`[backfill-search-text] ${updated}/${total}`);
  }

  console.log(`[backfill-search-text] Barcha ${updated} ta dori muvaffaqiyatli yangilandi.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
