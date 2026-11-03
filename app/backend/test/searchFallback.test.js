const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../src/lib/prisma");
const { rankMedicines, invalidateSynonymCache } = require("../src/lib/search");

test("bo'sh searchText bo'lganda ham fallback orqali qidiruv natija qaytaradi", async (t) => {
  const category = await prisma.category.findFirst({ select: { id: true } });
  assert.ok(category, "Test uchun kamida bitta kategoriya bo'lishi kerak");

  const testSlug = "test-montus-fallback-empty";
  await prisma.medicine.deleteMany({ where: { slug: testSlug } });

  const created = await prisma.medicine.create({
    data: {
      name: "Montus 10 mg test",
      slug: testSlug,
      description: "Montelukast tabletka",
      manufacturer: "Nobel Pharma",
      dosageForm: "tabletka",
      dosage: "10 mg",
      activeIngredient: "Montelukast",
      isPrescription: false,
      imageEmoji: "💊",
      searchText: "", // BO'SH searchText
      isActive: true,
      categoryId: category.id,
    },
  });

  t.after(async () => {
    await prisma.medicine.deleteMany({ where: { slug: testSlug } });
  });

  invalidateSynonymCache();

  // 1. Nom orqali fallback qidiruv
  const byName = await rankMedicines({ query: "montus", log: false });
  assert.ok(byName.hits.length > 0, "Nom bo'yicha kamida bitta dori topilishi kerak");
  const foundByName = byName.hits.some((h) => h.id === created.id);
  assert.ok(foundByName, "Bo'sh searchText li dori nom orqali fallback bilan topilishi kerak");

  // 2. Kirill nom orqali fallback qidiruv
  const byCyrillic = await rankMedicines({ query: "монтус", log: false });
  assert.ok(byCyrillic.hits.length > 0, "Kirill nom bo'yicha ham dori topilishi kerak");

  // 3. Faol modda orqali fallback qidiruv
  const byIngredient = await rankMedicines({ query: "montelukast", log: false });
  assert.ok(byIngredient.hits.length > 0, "Faol modda bo'yicha kamida bitta dori topilishi kerak");
  const foundByIng = byIngredient.hits.some((h) => h.id === created.id);
  assert.ok(foundByIng, "Bo'sh searchText li dori activeIngredient fallback orqali topilishi kerak");
});
