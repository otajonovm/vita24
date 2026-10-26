const prisma = require("../src/lib/prisma");
const { buildSearchText } = require("../src/lib/searchText");
const { invalidateSynonymCache, rankMedicines } = require("../src/lib/search");
const { seedSearchSynonyms } = require("../scripts/seed-search-synonyms");

const report = [];

async function ensureFixture(slug, name, ingredient, dosage) {
  const category = await prisma.category.findFirst({ select: { id: true } });
  if (!category) throw new Error("Test uchun kategoriya yo'q");
  const data = {
    name,
    description: name,
    manufacturer: "Vita test",
    dosageForm: "tabletka",
    dosage,
    activeIngredient: ingredient,
    isPrescription: false,
    imageEmoji: "-",
    categoryId: category.id,
    isActive: true,
  };
  data.searchText = buildSearchText(data);
  await prisma.medicine.upsert({
    where: { slug },
    update: data,
    create: { ...data, slug },
  });
}

async function runQuery(query) {
  const result = await rankMedicines({ query, limit: 3, log: false });
  const top = result.hits.map((hit) => hit.name);
  report.push({
    query,
    top1: top[0] || "",
    top2: top[1] || "",
    top3: top[2] || "",
    suggestions: result.suggestions.map((item) => item.name).join(", "),
    popular: result.popularIds.length,
  });
  return { ...result, top };
}

beforeAll(async () => {
  await seedSearchSynonyms();
  invalidateSynonymCache();
  await ensureFixture("vita-search-noshpa", "No-shpa 40 mg", "Drotaverin", "40 mg");
  await ensureFixture("vita-search-ambroksol", "Ambroksol 30 mg", "Ambroksol", "30 mg");
});

afterAll(async () => {
  console.table(report);
  await prisma.medicine.deleteMany({
    where: { slug: { in: ["vita-search-noshpa", "vita-search-ambroksol"] } },
  });
  await prisma.$disconnect();
});

const named = [
  ["paracetamol", /paracetamol/i],
  ["paratsitamol", /paracetamol/i],
  ["parasetamol", /paracetamol/i],
  ["парацетамол", /paracetamol/i],
  ["panadol", /panadol|paracetamol/i],
  ["acetaminophen", /paracetamol|panadol/i],
  ["amoxicillin", /amoksitsillin|amoxicillin/i],
  ["amoksilin", /amoksitsillin|amoxicillin/i],
  ["ибупрофен", /ibuprofen|nurofen/i],
  ["ibuprafen", /ibuprofen|nurofen/i],
  ["nurofen", /nurofen|ibuprofen/i],
  ["no shpa", /no-shpa|noshpa|drotaverin/i],
  ["noshpa", /no-shpa|noshpa|drotaverin/i],
  ["но-шпа", /no-shpa|noshpa|drotaverin/i],
  ["bosh og'rig'i", /paracetamol|ibuprofen|nurofen|sitramon/i],
  ["bosh ogrigi", /paracetamol|ibuprofen|nurofen|sitramon/i],
  ["бош оғриғи", /paracetamol|ibuprofen|nurofen|sitramon/i],
  ["головная боль", /paracetamol|ibuprofen|nurofen|sitramon/i],
  ["isitma", /paracetamol|panadol/i],
  ["yo'tal", /ambroksol/i],
  ["yoʻtal", /ambroksol/i],
];

test.each(named)("%s birinchi 3 ta ichida to'g'ri dorini qaytaradi", async (query, pattern) => {
  const { top } = await runQuery(query);
  expect(top.join(" | ")).toMatch(pattern);
});

test("500 paracetamol faqat 500 mg ni birinchi qo'yadi", async () => {
  const { top } = await runQuery("500 paracetamol");
  expect(top[0] || "").toMatch(/paracetamol/i);
  expect(top[0] || "").toMatch(/500/);
  for (const name of top) {
    if (/paracetamol|panadol/i.test(name)) expect(name).toMatch(/500/);
  }
});

test("zzzz bo'sh qolmaydi", async () => {
  const result = await runQuery("zzzz");
  expect(result.hits.length + result.suggestions.length + result.popularIds.length).toBeGreaterThan(0);
});
