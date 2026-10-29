const test = require("node:test");
const assert = require("node:assert/strict");

const { canTransition } = require("../src/lib/orderState");
const { initialCustomerStatus } = require("../src/lib/customerOrderView");
const {
  canDeliver,
  canFail,
  canPickup,
  courierIsAssignable,
  handoverDifference,
  serializeCourierOrder,
} = require("../src/lib/courierRules");

const cashOrder = {
  id: "o1",
  orderNumber: "V-1",
  status: "DELIVERING",
  deliveryType: "DELIVERY",
  courierId: "courier-a",
  courierStage: "PICKED_UP",
  customerName: "Ali",
  customerPhone: "+998901112233",
  deliveryAddress: "Yunusobod 4",
  deliveryLat: 41.3,
  deliveryLng: 69.2,
  items: [{ quantity: 2, medicine: { name: "Paracetamol" }, isPrescription: true }],
  payment: { provider: "CASH", status: "PENDING", amount: 85000 },
  prescription: { fileUrl: "secret", status: "APPROVED" },
  pharmacistNote: "ichki",
  notes: "mijoz izohi",
};

test("boshqa kuryer buyurtmani o'zgartira olmaydi", () => {
  assert.equal(canPickup({ ...cashOrder, status: "READY", courierStage: "ASSIGNED" }, "courier-b").ok, false);
  assert.equal(canPickup({ ...cashOrder, status: "READY", courierStage: "ASSIGNED" }, "courier-b").code, "FORBIDDEN");
  assert.equal(
    canTransition({
      from: "READY",
      to: "DELIVERING",
      role: "COURIER",
      deliveryType: "DELIVERY",
      payment: cashOrder.payment,
      userId: "courier-b",
      courierId: "courier-a",
    }),
    false
  );
  assert.equal(canDeliver(cashOrder, "courier-b", { method: "CASH", collectedAmount: 85000 }).code, "FORBIDDEN");
});

test("naqd va terminal buyurtma tasdiqsiz yakunlanmaydi", () => {
  assert.equal(canDeliver(cashOrder, "courier-a").code, "CASH_NOT_RECEIVED");
  assert.equal(canDeliver(cashOrder, "courier-a", { method: "CASH" }).code, "VALIDATION_ERROR");
  const terminal = {
    ...cashOrder,
    payment: { provider: "CARD_TERMINAL", status: "PENDING", amount: 85000 },
  };
  assert.equal(canDeliver(terminal, "courier-a").code, "CASH_NOT_RECEIVED");
  assert.equal(canDeliver(terminal, "courier-a", { method: "CARD_TERMINAL", collectedAmount: 85000 }).ok, true);
  assert.equal(
    canTransition({
      from: "DELIVERING",
      to: "COMPLETED",
      role: "COURIER",
      deliveryType: "DELIVERY",
      payment: terminal.payment,
      userId: "courier-a",
      courierId: "courier-a",
    }),
    false
  );
  assert.equal(canDeliver(cashOrder, "courier-a", { method: "CASH", collectedAmount: 85000, receiptGiven: true }).ok, true);
  const prepaid = { ...cashOrder, payment: { provider: "CLICK", status: "COMPLETED", amount: 85000 } };
  assert.equal(canDeliver(prepaid, "courier-a", {}).proof.method, "PREPAID");
  assert.equal(canDeliver(prepaid, "courier-a", {}).proof.collectedAmount, null);
});

test("olib ketish buyurtmalari o'zgarmagan", () => {
  assert.equal(canTransition({ from: "READY", to: "COMPLETED", role: "BRANCH_ADMIN", deliveryType: "PICKUP", payment: { provider: "CASH", status: "COMPLETED" } }), true);
  assert.equal(canTransition({ from: "READY", to: "DELIVERING", role: "BRANCH_ADMIN", deliveryType: "PICKUP" }), false);
  assert.equal(canTransition({ from: "READY", to: "DELIVERING", role: "COURIER", deliveryType: "PICKUP", userId: "courier-a", courierId: "courier-a" }), false);
  assert.equal(canPickup({ ...cashOrder, status: "READY", courierStage: "ASSIGNED", deliveryType: "PICKUP" }, "courier-a").ok, false);
  assert.equal(initialCustomerStatus({ hasRx: false, paymentMethod: "CLICK" }).status, "WAITING_PAYMENT");
  assert.equal(initialCustomerStatus({ hasRx: false, paymentMethod: "CARD_TERMINAL" }).status, "PREPARING");
});

test("yetkazilmagan buyurtma READY holatiga qaytadi", () => {
  const failed = canFail(
    { ...cashOrder, status: "DELIVERING", courierStage: "PICKED_UP" },
    "courier-a",
    { code: "NO_ANSWER" }
  );
  assert.equal(failed.ok, true);
  assert.equal(failed.status, "READY");
  assert.equal(failed.courierStage, "FAILED");
});

test("kuryer javobida retsept va ichki izoh yo'q", () => {
  const view = serializeCourierOrder(cashOrder);
  assert.equal(view.prescription, undefined);
  assert.equal(view.pharmacistNote, undefined);
  assert.equal(view.notes, undefined);
  assert.equal(view.adminNote, undefined);
  assert.equal(view.items[0].name, "Paracetamol");
  assert.equal(view.items[0].isPrescription, undefined);
  assert.equal(view.amountDue, 85000);
  assert.equal(JSON.stringify(view).includes("secret"), false);
  assert.equal(JSON.stringify(view).includes("ichki"), false);
});

test("topshirilgan summa farqi belgilanadi", () => {
  const match = handoverDifference(85000, 85000);
  assert.equal(match.flagged, false);
  assert.equal(match.delta, 0);
  const diff = handoverDifference(70000, 85000);
  assert.equal(diff.flagged, true);
  assert.equal(diff.delta, -15000);
});

test("nofaol kuryerga buyurtma biriktirilmaydi", () => {
  const active = { role: "COURIER", status: "ACTIVE", courierBranches: [{ branchId: "b1" }] };
  const suspended = { ...active, status: "SUSPENDED" };
  assert.equal(courierIsAssignable(active, "b1"), true);
  assert.equal(courierIsAssignable(suspended, "b1"), false);
  assert.equal(courierIsAssignable(active, "b2"), false);
});
