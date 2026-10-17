const test = require("node:test");
const assert = require("node:assert/strict");

const { customerCanCancel } = require("../src/lib/orderState");
const { exceedsAvailable, stockLevel } = require("../src/lib/stock");
const { createRequestGate } = require("../src/lib/requestGate");
const { nextStepKey, showCustomerDeliveryFee, customerRejectReason } = require("../src/lib/customerOrderView");

test("mijoz faqat ruxsat etilgan holatlarda bekor qiladi", () => {
  assert.equal(customerCanCancel("PENDING_PRESCRIPTION"), true);
  assert.equal(customerCanCancel("PENDING_BRANCH"), true);
  assert.equal(customerCanCancel("WAITING_PAYMENT"), true);
  assert.equal(customerCanCancel("PAID"), true);
  assert.equal(customerCanCancel("PREPARING"), false);
  assert.equal(customerCanCancel("READY"), false);
  assert.equal(customerCanCancel("DELIVERING"), false);
  assert.equal(customerCanCancel("COMPLETED"), false);
});

test("miqdor filial qoldig'idan oshmaydi", () => {
  assert.equal(exceedsAvailable(5, 5), false);
  assert.equal(exceedsAvailable(6, 5), true);
  assert.equal(exceedsAvailable(1, 0), true);
  assert.equal(stockLevel(0), "out");
  assert.equal(stockLevel(5), "low");
  assert.equal(stockLevel(6), "in");
});

test("ketma-ket qidiruvda faqat oxirgi so'rov natijasi qoladi", () => {
  const gate = createRequestGate();
  const queries = ["paracetamol", "paracetmol", "xyzdori"];
  const ids = queries.map(() => gate.next());
  const shown = [];
  [2, 0, 1].forEach((index) => {
    if (gate.isLatest(ids[index])) shown.push(queries[index]);
  });
  assert.deepEqual(shown, ["xyzdori"]);
  assert.equal(gate.isLatest(ids[2]), true);
  assert.equal(gate.isLatest(ids[0]), false);
});

test("olib ketishda yetkazish qatori yashirinadi", () => {
  assert.equal(showCustomerDeliveryFee({ deliveryType: "PICKUP", deliveryFee: 0 }), false);
  assert.equal(showCustomerDeliveryFee({ deliveryType: "PICKUP", deliveryFee: 15000 }), false);
  assert.equal(showCustomerDeliveryFee({ deliveryType: "DELIVERY", deliveryFee: 0 }), false);
  assert.equal(showCustomerDeliveryFee({ deliveryType: "DELIVERY", deliveryFee: 15000 }), true);
  assert.equal(nextStepKey({ status: "PREPARING" }), "order.next.preparing");
  assert.equal(nextStepKey({ status: "READY", deliveryType: "PICKUP" }), "order.next.readyPickup");
  assert.equal(nextStepKey({ status: "DELIVERING", deliveryType: "DELIVERY" }), "order.next.delivering");
  assert.equal(customerRejectReason({ rejectNote: "Muhr yo'q" }), "Muhr yo'q");
  assert.equal(customerRejectReason({ rejectNote: "" }), "");
});
