const test = require("node:test");
const assert = require("node:assert/strict");
const { assertCustomerCanOrder } = require("../src/lib/customerAccess");
const { customerBlockSchema } = require("../src/validators/adminValidator");

test("bloklangan mijoz buyurtma bera olmaydi", () => {
  assert.throws(
    () => assertCustomerCanOrder({ status: "SUSPENDED", blockReason: "qarz" }),
    (error) => error.statusCode === 403 && error.code === "CUSTOMER_BLOCKED" && /qarz/.test(error.message)
  );
  assert.doesNotThrow(() => assertCustomerCanOrder({ status: "ACTIVE" }));
});

test("bloklash sababsiz qabul qilinmaydi", () => {
  assert.throws(() => customerBlockSchema.parse({ action: "BLOCK", reason: "yo" }));
  const parsed = customerBlockSchema.parse({ action: "UNBLOCK", reason: "xato blok" });
  assert.equal(parsed.action, "UNBLOCK");
  assert.equal(parsed.reason, "xato blok");
});
