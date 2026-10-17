const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, rowsFromMatrix, classifyRows } = require("../src/lib/catalogImport");

test("import xato qatorni ajratadi va takrorni rad etadi", () => {
  const matrix = parseCsv(
    "Nomi;Shakli;Ishlab chiqaruvchi;Kategoriya;Qadoqdagi soni;Asosiy narx;Retseptli\n" +
      "Sinov dori;Tabletka;Vita;Og'riq;10;12000;yo'q\n" +
      ";Tabletka;Vita;Og'riq;10;12000;ha\n" +
      "Sinov dori;Tabletka;Vita;Og'riq;10;12000;yo'q\n"
  );
  const parsed = rowsFromMatrix(matrix);
  assert.equal(parsed.error, "");
  const result = classifyRows(parsed.rows, {
    categories: new Map([["og'riq", "cat-1"]]),
    medicinesByBarcode: new Map(),
    medicinesByName: new Map(),
  });
  assert.equal(result.createCount, 1);
  assert.equal(result.rows[1].ok, false);
  assert.match(result.rows[1].errors.join(" "), /Nomi/);
  assert.equal(result.rows[2].ok, false);
  assert.match(result.rows[2].errors.join(" "), /takror/);
});
