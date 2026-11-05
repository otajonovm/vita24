const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeSearch,
  fixRuLayoutToLatin,
  fixEnLayoutToCyrillic,
  adjacentSwaps,
  searchVariants,
} = require("../src/lib/searchText");
const { expandQuery } = require("../src/lib/search");

test("RU layout xatosi paracetamol ga aylanadi", () => {
  assert.equal(fixRuLayoutToLatin("зфкфсуефьщд"), "paracetamol");
  assert.equal(normalizeSearch(fixRuLayoutToLatin("зфкфсуефьщд")), normalizeSearch("paracetamol"));
});

test("EN layout xatosi парацетамол ga aylanadi (standart QWERTY↔ЙЦУКЕН)", () => {
  // п(a)р(a)цетамол → g f h f w t n f v j k
  const cyr = fixEnLayoutToCyrillic("gfhfwtnfvjk");
  assert.equal(normalizeSearch(cyr), normalizeSearch("парацетамол"));
});

test("ghfhwtnfvjk (f/h aralash) ham paracetamol oilasiga yaqinlashadi", () => {
  const variants = searchVariants("ghfhwtnfvjk").map((item) => normalizeSearch(item));
  const target = normalizeSearch("paracetamol");
  assert.ok(
    variants.some((item) => item === target || item.includes("parasetamol") || item.includes("prarsetamol")),
    `variants=${variants.join("|")}`
  );
});

test("nuorfen swap nurofen ni beradi", () => {
  const swaps = adjacentSwaps("nuorfen");
  assert.ok(swaps.includes("nurofen"));
});

test("searchVariants kbd va swap ni qamrab oladi", () => {
  const variants = searchVariants("зфкфсуефьщд").map((item) => normalizeSearch(item));
  assert.ok(variants.includes(normalizeSearch("paracetamol")));
  const swapVariants = searchVariants("nuorfen").map((item) => normalizeSearch(item));
  assert.ok(swapVariants.includes(normalizeSearch("nurofen")));
});

test("expandQuery brand prefix va reverse brand", () => {
  const synonyms = [
    { term: "nurofen", canonical: "ibuprofen", type: "BRAND", termNorm: "nurofen", canonicalNorm: "ibuprofen" },
    { term: "no-shpa", canonical: "drotaverin", type: "BRAND", termNorm: "noshpa", canonicalNorm: "drotaverin" },
    { term: "drotaverin", canonical: "drotaverin", type: "INGREDIENT", termNorm: "drotaverin", canonicalNorm: "drotaverin" },
  ];
  const nuro = expandQuery("nuro", synonyms);
  assert.ok(nuro.expansions.some((item) => item.norm === "ibuprofen"));

  const drota = expandQuery("дротаверин", synonyms);
  assert.ok(drota.expansions.some((item) => item.type === "BRAND" && item.norm.includes("noshpa")));
});
