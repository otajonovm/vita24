const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeCardNumber,
  isValidCardNumber,
  formatCardGrouped,
  maskCardNumber,
  cardTransferPublic,
  RECEIPT_REJECT_REASONS,
} = require("../src/lib/cardTransfer");
const { assertPaymentAllowed, checkoutRulesFrom } = require("../src/lib/shopSettings");
const { expectedPayable, amountsMatch } = require("../src/lib/paymentSettlement");
const { getCustomerOrderView, initialCustomerStatus } = require("../src/lib/customerOrderView");

test("karta raqami 16 raqam va maskalanadi", () => {
  assert.equal(normalizeCardNumber("8600 1234 5678 9012"), "8600123456789012");
  assert.equal(isValidCardNumber("8600-1234-5678-9012"), true);
  assert.equal(isValidCardNumber("860012345678"), false);
  assert.equal(formatCardGrouped("8600123456789012"), "8600 1234 5678 9012");
  assert.equal(maskCardNumber("8600123456789012"), "8600 **** **** 9012");
});

test("public settings faqat yoqilganda to'liq raqamni beradi", () => {
  const off = cardTransferPublic({
    cardTransferEnabled: false,
    cardTransferNumber: "8600123456789012",
    cardTransferHolder: "Test",
  });
  assert.equal(off.cardTransferEnabled, false);
  assert.equal(off.cardTransferNumber, undefined);

  const on = cardTransferPublic({
    cardTransferEnabled: true,
    cardTransferNumber: "8600123456789012",
    cardTransferHolder: "Ali",
    cardTransferBank: "Humo",
    cardTransferTimeoutMin: 30,
  });
  assert.equal(on.cardTransferEnabled, true);
  assert.equal(on.cardTransferNumber, "8600123456789012");
  assert.equal(on.cardTransferHolder, "Ali");
});

test("CARD_TRANSFER checkout oqimi WAITING_PAYMENT", () => {
  assert.deepEqual(initialCustomerStatus({ hasRx: false, paymentMethod: "card_transfer" }), {
    status: "WAITING_PAYMENT",
    reservation: "payment",
    capture: false,
  });
  assert.equal(initialCustomerStatus({ hasRx: true, paymentMethod: "CARD_TRANSFER" }).status, "PENDING_PRESCRIPTION");
});

test("CARD_TRANSFER sozlama va timeout", () => {
  const shop = {
    paymeEnabled: false,
    clickEnabled: false,
    cashEnabled: false,
    cardTerminalEnabled: false,
    cardTransferEnabled: true,
    cardTransferNumber: "8600123456789012",
    cardTransferHolder: "Ali",
    cardTransferTimeoutMin: 45,
    pickupEnabled: true,
    paymentWindowMinutes: 15,
    reviewWindowMinutes: 120,
    deliveryFee: 15000,
    freeDeliveryFrom: 200000,
  };
  assert.doesNotThrow(() => assertPaymentAllowed(shop, "CARD_TRANSFER", "PICKUP"));
  assert.throws(() => assertPaymentAllowed({ ...shop, cardTransferEnabled: false }, "CARD_TRANSFER", "DELIVERY"), /o'tkazma/);
  const rules = checkoutRulesFrom(shop, { paymentMethod: "CARD_TRANSFER" });
  assert.equal(rules.paymentWindowMinutes, 45);
});

test("mijoz view kartaga o'tkazma UI bayroqlari", () => {
  const order = {
    status: "WAITING_PAYMENT",
    payment: { provider: "CARD_TRANSFER", status: "PENDING", amount: 10000 },
    paymentReceipts: [],
  };
  const view = getCustomerOrderView(order);
  assert.equal(view.showCardTransfer, true);
  assert.equal(view.showPay, false);
  assert.equal(view.showPayTimer, true);
  assert.equal(view.paymentKey, "order.pay.cardTransfer");

  const pending = getCustomerOrderView({
    ...order,
    paymentReceipts: [{ id: "1", status: "PENDING", createdAt: new Date().toISOString() }],
  });
  assert.equal(pending.receiptPending, true);
  assert.equal(pending.showPayTimer, false);
  assert.equal(pending.titleKey, "order.status.receiptReview");
});

test("expectedPayable buyurtma yetkazish haqini hisoblaydi", () => {
  const delivery = { subtotal: 100000, deliveryFee: 15000, discount: 0, deliveryType: "DELIVERY" };
  const pickup = { subtotal: 100000, deliveryFee: 0, discount: 0, deliveryType: "PICKUP" };
  assert.equal(expectedPayable(delivery), 115000);
  assert.equal(expectedPayable(pickup), 100000);
  assert.equal(amountsMatch(115000, 115000), true);
});

test("rad etish sabablari to'liq", () => {
  assert.equal(RECEIPT_REJECT_REASONS.NOT_RECEIVED, "Pul tushmagan");
  assert.equal(RECEIPT_REJECT_REASONS.WRONG_AMOUNT, "Summa noto'g'ri");
  assert.equal(RECEIPT_REJECT_REASONS.UNREADABLE, "Chek o'qilmaydi");
  assert.equal(RECEIPT_REJECT_REASONS.OTHER, "Boshqa");
});
