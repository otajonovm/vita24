const prisma = require("../src/lib/prisma");
const { buildSearchText } = require("../src/lib/searchText");
const { invalidateSynonymCache, rankMedicines } = require("../src/lib/search");
const { seedSearchSynonyms } = require("../scripts/seed-search-synonyms");

const report = [];

async function ensureFixture(slug, name, ingredient, dosage) {
  let category = await prisma.category.findFirst({ select: { id: true } });
  if (!category) {
    category = await prisma.category.create({
      data: { name: "Search test", slug: "vita-search-test", icon: "pill" },
      select: { id: true },
    });
  }
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

const PARA = /paracetamol|парацетамол|panadol|панадол/i;
const IBU = /ibuprofen|ибупрофен|nurofen|нурофен/i;
const AMOX = /amoksitsillin|amoxicillin|амоксициллин|амоксиклав/i;
const NOSHPA = /no-shpa|noshpa|но-шпа|drotaverin|дротаверин/i;
const COUGH = /ambroksol|амброксол|bromgeksin|бромгексин/i;
const STOMACH = /omeprazol|омепразол|omez|омез/i;
const HEAD = /paracetamol|парацетамол|ibuprofen|ибупрофен|nurofen|нурофен|sitramon|цитрамон/i;

const named = [
  ["paracetamol", PARA],
  ["paratsitamol", PARA],
  ["parasetamol", PARA],
  ["парацетамол", PARA],
  ["зфкфсуефьщд", PARA],
  ["gfhfwtnfvjk", PARA],
  ["ghfhwtnfvjk", PARA],
  ["panadol", /panadol|панадол|paracetamol|парацетамол/i],
  ["acetaminophen", PARA],
  ["amoxicillin", AMOX],
  ["amoksilin", AMOX],
  ["ибупрофен", IBU],
  ["ibuprafen", IBU],
  ["nurofen", IBU],
  ["nuorfen", IBU],
  ["nuro", IBU],
  ["no shpa", NOSHPA],
  ["noshpa", NOSHPA],
  ["но-шпа", NOSHPA],
  ["дротаверин", NOSHPA],
  ["bosh og'rig'i", HEAD],
  ["bosh ogrigi", HEAD],
  ["бош оғриғи", HEAD],
  ["головная боль", HEAD],
  ["isitma", PARA],
  ["yo'tal", COUGH],
  ["yoʻtal", COUGH],
  ["oshqozon og'rig'i", STOMACH],
];

test.each(named)("%s birinchi 3 ta ichida to'g'ri dorini qaytaradi", async (query, pattern) => {
  const { top } = await runQuery(query);
  expect(top.join(" | ")).toMatch(pattern);
});

test("500 paracetamol faqat 500 mg ni birinchi qo'yadi", async () => {
  const { top } = await runQuery("500 paracetamol");
  expect(top[0] || "").toMatch(PARA);
  expect(top[0] || "").toMatch(/500/);
  for (const name of top) {
    if (PARA.test(name) || /panadol|панадол/i.test(name)) expect(name).toMatch(/500/);
  }
});

test("zzzz bo'sh qolmaydi", async () => {
  const result = await runQuery("zzzz");
  expect(result.hits.length + result.suggestions.length + result.popularIds.length).toBeGreaterThan(0);
});
