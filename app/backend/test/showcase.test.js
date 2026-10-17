const test = require("node:test");
const assert = require("node:assert/strict");
const { SHOWCASE_LIMIT, showcaseOrderError } = require("../src/lib/showcase");

test("vitrina tartibi to'liq ro'yxatni talab qiladi", () => {
  assert.equal(SHOWCASE_LIMIT, 20);
  assert.equal(showcaseOrderError(["a", "b"], ["b", "a"]), "");
  assert.equal(showcaseOrderError(["a", "b"], ["a"]), "stale");
  assert.equal(showcaseOrderError(["a"], ["a", "a"]), "duplicate");
  assert.equal(showcaseOrderError([], Array.from({ length: 21 }, (_, index) => String(index))), "limit");
});
