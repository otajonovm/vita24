const test = require("node:test");
const assert = require("node:assert/strict");
const { renderTemplate, windowMinutes, assertPaymentAllowed, checkoutRulesFrom } = require("../src/lib/shopSettings");
const { quoteTotals, DELIVERY_FEE, FREE_DELIVERY_FROM } = require("../src/lib/pricing");

test("shablon o'zgaruvchilarni qo'yadi", () => {
  const text = renderTemplate("Kod {{ code }} telefon {{phone}}", { code: "123456", phone: "+99890" });
  assert.equal(text, "Kod 123456 telefon +99890");
});

test("quoteTotals sozlamadagi narx va chegarani oladi", () => {
  assert.equal(quoteTotals(49800).deliveryFee, DELIVERY_FEE);
  assert.equal(quoteTotals(10000, { deliveryFee: 16000, freeFrom: 50000 }).deliveryFee, 16000);
  assert.equal(quoteTotals(50000, { deliveryFee: 16000, freeFrom: 50000 }).deliveryFee, 0);
  assert.equal(quoteTotals(10000, { deliveryType: "PICKUP", deliveryFee: 16000 }).deliveryFee, 0);
  assert.equal(FREE_DELIVERY_FROM, 200000);
});

test("zaxira oynasi buyurtma suratidan olinadi", () => {
  const rules = checkoutRulesFrom({
    deliveryFee: 15000,
    freeDeliveryFrom: 200000,
    reviewWindowMinutes: 90,
    paymentWindowMinutes: 10,
  });
  assert.equal(windowMinutes("review", rules), 90);
  assert.equal(windowMinutes("payment", rules), 10);
  assert.equal(windowMinutes("payment", null), 15);
  assert.equal(windowMinutes("review", {}), 120);
});

test("o'chirilgan to'lov va olib ketish rad etiladi", () => {
  const shop = {
    paymeEnabled: false,
    clickEnabled: true,
    cashEnabled: true,
    pickupEnabled: false,
  };
  assert.throws(() => assertPaymentAllowed(shop, "PAYME", "DELIVERY"), /Payme/);
  assert.throws(() => assertPaymentAllowed(shop, "CASH", "PICKUP"), /Olib ketish/);
  assert.doesNotThrow(() => assertPaymentAllowed(shop, "CLICK", "DELIVERY"));
});
