const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSearch, escapeLike } = require("../src/lib/searchText");

test("paracetamol, paratsetamol va kirill bitta ko'rinishga keladi", () => {
  const expected = normalizeSearch("paracetamol");
  assert.equal(normalizeSearch("paratsetamol"), expected);
  assert.equal(normalizeSearch("парацетамол"), expected);
  assert.equal(normalizeSearch("Paracetamol"), expected);
});

test("amoxicillin va amoksitsillin bir xil", () => {
  assert.equal(normalizeSearch("amoxicillin"), normalizeSearch("amoksitsillin"));
});

test("yo'tal va yoʻtal bir xil", () => {
  assert.equal(normalizeSearch("yo'tal"), normalizeSearch("yoʻtal"));
  assert.equal(normalizeSearch("йўтал"), normalizeSearch("yo'tal"));
});

test("bosh og'rig'i va кирилл бир хил", () => {
  assert.equal(normalizeSearch("bosh og'rig'i"), normalizeSearch("bosh ogrigi"));
  assert.equal(normalizeSearch("бош оғриғи"), normalizeSearch("bosh ogrigi"));
});

test("foiz va pastki chiziq qochiriladi", () => {
  assert.equal(escapeLike("100%_a"), "100\\%\\_a");
});
