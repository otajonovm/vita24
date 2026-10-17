const test = require("node:test");
const assert = require("node:assert/strict");
const { clampSyncIntervalMinutes } = require("../src/lib/lekkoSync");

test("sinxron oralig'i 1 dan 1440 daqiqagacha", () => {
  assert.equal(clampSyncIntervalMinutes(10), 10);
  assert.equal(clampSyncIntervalMinutes(1440), 1440);
  assert.throws(() => clampSyncIntervalMinutes(0));
  assert.throws(() => clampSyncIntervalMinutes(1441));
  assert.throws(() => clampSyncIntervalMinutes(1.5));
});
