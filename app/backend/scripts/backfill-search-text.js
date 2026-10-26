const prisma = require("../src/lib/prisma");
const { buildSearchText } = require("../src/lib/searchText");

async function main() {
  const total = await prisma.medicine.count();
  let skip = 0;
  let updated = 0;
  const take = 200;
  while (skip < total) {
    const rows = await prisma.medicine.findMany({
      skip,
      take,
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
    for (const row of rows) {
      await prisma.medicine.update({
        where: { id: row.id },
        data: { searchText: buildSearchText(row) },
      });
      updated += 1;
    }
    skip += rows.length;
    console.log(`${updated}/${total}`);
  }
  console.log(`searchText yangilandi: ${updated}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
