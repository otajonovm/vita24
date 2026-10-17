const test = require("node:test");
const assert = require("node:assert/strict");
const { suggestName } = require("../src/lib/searchText");

test("yozuv xatosi yaqin dori nomini taklif qiladi", () => {
  const names = ["Paracetamol 500 mg", "Ibuprofen 400 mg", "Loratadin 10 mg"];
  assert.equal(suggestName("pracetamol", names), "Paracetamol");
  assert.equal(suggestName("Ibuprofn", names), "Ibuprofen");
  assert.equal(suggestName("zzzzqqq", names), "");
});
