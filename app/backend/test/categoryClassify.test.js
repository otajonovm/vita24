const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyMedicine, buildSynonymIndex } = require("../src/lib/categoryClassify");

const cases = [
  ["парацетамол таб. 500мг №10", "ogriq-isitma"],
  ["панадол таб. 500мг", "ogriq-isitma"],
  ["ибупрофен таб. 400мг", "ogriq-isitma"],
  ["анальгин р-р 50%", "ogriq-isitma"],
  ["амоксициллин таб. 500мг", "antibiotiklar"],
  ["амоксиклав пршк для р-ра", "antibiotiklar"],
  ["азитромицин таб. 500мг", "antibiotiklar"],
  ["амброксол сироп 15мг/5мл", "shamollash-yotal"],
  ["антикашель сироп 100мл", "shamollash-yotal"],
  ["лоратадин таб. 10мг", "allergiya"],
  ["кларитин таб.", "allergiya"],
  ["омез капс. 20мг", "oshqozon-ichak"],
  ["алмагель сусп. 170мл", "oshqozon-ichak"],
  ["амлодипин таб. 5мг", "yurak-qon"],
  ["эналаприл таб. 10мг", "yurak-qon"],
  ["аквадетрим витамин д3 капли", "vitaminlar-bad"],
  ["21st century витамин с таб.", "vitaminlar-bad"],
  ["бепантен крем 30г", "teri-kremlar"],
  ["цинковая мазь 25г", "teri-kremlar"],
  ["диклофенак гель 5%", "bogim-mushak"],
  ["амарил таб. 2мг", "diabet"],
  ["метформин таб. 500мг", "diabet"],
  ["анаферон детский таб.", "bolalar"],
  ["мелатонин капс. 3мг", "asab-uyqu"],
  ["визин капли глазные", "kuz-quloq-burun"],
  ["називин капли назал", "kuz-quloq-burun"],
  ["тержинан вагин. таб.", "ayollar"],
  ["шприц 5мл №1", "tibbiy-buyumlar"],
];

for (const [name, expected] of cases) {
  test(`classify: ${name} → ${expected}`, () => {
    const hit = classifyMedicine({ name, dosageForm: "Noma'lum" });
    assert.equal(hit.slug, expected, `${name} got ${hit.slug} via ${hit.matchedRule}`);
  });
}

test("ATC prefix maps to category", () => {
  assert.equal(classifyMedicine({ name: "x", atcCode: "J01CA04" }).slug, "antibiotiklar");
  assert.equal(classifyMedicine({ name: "x", atcCode: "C09AA02" }).slug, "yurak-qon");
  assert.equal(classifyMedicine({ name: "x", atcCode: "N02BE01" }).slug, "ogriq-isitma");
});

test("activeIngredient + synonym index", () => {
  const index = buildSynonymIndex([
    { term: "panadol", canonical: "paratsetamol", type: "BRAND" },
    { term: "paratsetamol", canonical: "paratsetamol", type: "INGREDIENT" },
  ]);
  const hit = classifyMedicine(
    { name: "panadol extra", dosageForm: "Noma'lum", activeIngredient: "" },
    { synonymIndex: index }
  );
  assert.equal(hit.slug, "ogriq-isitma");
});

test("ingredient field beats unknown name", () => {
  const hit = classifyMedicine({
    name: "xyz unknown brand",
    activeIngredient: "amoksitsillin",
    dosageForm: "Noma'lum",
  });
  assert.equal(hit.slug, "antibiotiklar");
});
