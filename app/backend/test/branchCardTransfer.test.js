const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveCardTransfer,
  hasUsableCard,
  isMaskedCardNumber,
  maskCardNumber,
  normalizeCardNumber,
  isValidCardNumber,
} = require("../src/lib/cardTransfer");
const { assertPaymentAllowed, checkoutRulesFrom } = require("../src/lib/shopSettings");
const { branchCardSettingsSchema } = require("../src/validators/branchAdminValidator");
const { PANEL_ORDER_STATUSES } = require("../src/validators/queryFields");
const { AppError } = require("../src/lib/response");
const { assertBranchAccess } = require("../src/middlewares/authMiddleware");
const { detectMimeFromBuffer } = require("../src/lib/paymentReceiptFiles");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

test("payment_review PANEL_ORDER_STATUSES da bor", () => {
  assert.ok(PANEL_ORDER_STATUSES.includes("payment_review"));
});

test("filial kartasi globaldan ustun", () => {
  const branch = {
    cardTransferEnabled: true,
    cardTransferNumber: "8600123456789012",
    cardTransferHolder: "Filial Ali",
    cardTransferBank: "Humo",
  };
  const shop = {
    cardTransferEnabled: true,
    cardTransferNumber: "9860098765432100",
    cardTransferHolder: "Global",
    cardTransferBank: "Uzcard",
    cardTransferTimeoutMin: 45,
  };
  const resolved = resolveCardTransfer(branch, shop);
  assert.equal(resolved.source, "branch");
  assert.equal(resolved.cardTransferNumber, "8600123456789012");
  assert.equal(resolved.cardTransferHolder, "Filial Ali");
  assert.equal(resolved.cardTransferTimeoutMin, 45);
});

test("filialda karta bo'lmasa global fallback", () => {
  const branch = {
    cardTransferEnabled: false,
    cardTransferNumber: "",
    cardTransferHolder: "",
  };
  const shop = {
    cardTransferEnabled: true,
    cardTransferNumber: "9860098765432100",
    cardTransferHolder: "Global",
    cardTransferTimeoutMin: 30,
  };
  const resolved = resolveCardTransfer(branch, shop);
  assert.equal(resolved.source, "shop");
  assert.equal(resolved.cardTransferNumber, "9860098765432100");
});

test("filial va global yo'q — CARD_TRANSFER rad", () => {
  const card = resolveCardTransfer(
    { cardTransferEnabled: false },
    {
      paymeEnabled: true,
      clickEnabled: true,
      cashEnabled: true,
      cardTerminalEnabled: true,
      cardTransferEnabled: false,
      pickupEnabled: true,
    }
  );
  assert.equal(card.cardTransferEnabled, false);
  const shop = {
    paymeEnabled: true,
    clickEnabled: true,
    cashEnabled: true,
    cardTerminalEnabled: true,
    ...card,
    pickupEnabled: true,
  };
  assert.throws(() => assertPaymentAllowed(shop, "CARD_TRANSFER", "DELIVERY"), /o'tkazma/);
});

test("buyurtma snapshot filial kartasini saqlaydi", () => {
  const shop = {
    deliveryFee: 15000,
    freeDeliveryFrom: 200000,
    reviewWindowMinutes: 120,
    paymentWindowMinutes: 15,
    cardTransferTimeoutMin: 40,
  };
  const card = resolveCardTransfer(
    {
      cardTransferEnabled: true,
      cardTransferNumber: "8600 1234 5678 9012",
      cardTransferHolder: "Ali",
      cardTransferBank: "Humo",
    },
    shop
  );
  const rules = checkoutRulesFrom(
    { ...shop, cardTransferTimeoutMin: card.cardTransferTimeoutMin },
    { paymentMethod: "CARD_TRANSFER" }
  );
  rules.cardTransferNumber = card.cardTransferNumber;
  rules.cardTransferHolder = card.cardTransferHolder;
  rules.cardTransferBank = card.cardTransferBank;
  rules.cardTransferTimeoutMin = card.cardTransferTimeoutMin;

  assert.equal(rules.cardTransferNumber, "8600123456789012");
  assert.equal(rules.cardTransferHolder, "Ali");
  assert.equal(rules.paymentWindowMinutes, 40);

  // Farmatsevt keyin o'zgartirsa ham snapshot o'zgarmaydi
  const later = resolveCardTransfer(
    {
      cardTransferEnabled: true,
      cardTransferNumber: "9860000000000000",
      cardTransferHolder: "Yangi",
    },
    shop
  );
  assert.notEqual(rules.cardTransferNumber, later.cardTransferNumber);
});

test("branch card validator: yoqilganda raqam va egasi majburiy", () => {
  const bad = branchCardSettingsSchema.safeParse({
    cardTransferEnabled: true,
    cardTransferNumber: "123",
    cardTransferHolder: "",
  });
  assert.equal(bad.success, false);

  const ok = branchCardSettingsSchema.safeParse({
    cardTransferEnabled: true,
    cardTransferNumber: "8600123456789012",
    cardTransferHolder: "Ali",
    cardTransferBank: "",
  });
  assert.equal(ok.success, true);

  const masked = branchCardSettingsSchema.safeParse({
    cardTransferEnabled: true,
    cardTransferNumber: "8600 **** **** 9012",
    cardTransferHolder: "Ali",
  });
  assert.equal(masked.success, true);
});

test("boshqa filial card-settings uchun 403", () => {
  const req = { user: { role: "BRANCH_ADMIN", branchId: "branch-a", id: "u1" } };
  assert.throws(
    () => assertBranchAccess(req, "branch-b", { write: true }),
    (err) => err instanceof AppError && err.statusCode === 403
  );
  assert.equal(assertBranchAccess(req, "branch-a", { write: true }), "branch-a");
});

test("maskalangan raqam aniqlanadi", () => {
  assert.equal(isMaskedCardNumber("8600 **** **** 9012"), true);
  assert.equal(isMaskedCardNumber("8600123456789012"), false);
  assert.equal(maskCardNumber("8600123456789012"), "8600 **** **** 9012");
  assert.equal(hasUsableCard({ cardTransferEnabled: true, cardTransferNumber: "8600123456789012", cardTransferHolder: "A" }), true);
  assert.equal(isValidCardNumber(normalizeCardNumber("8600-1234-5678-9012")), true);
});

test("chek magic bytes JPEG/PNG/PDF", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
  const pdf = Buffer.from("%PDF-1.4 dummy");
  const fake = Buffer.from("not-a-real-file!!");
  assert.equal(detectMimeFromBuffer(jpeg), "image/jpeg");
  assert.equal(detectMimeFromBuffer(png), "image/png");
  assert.equal(detectMimeFromBuffer(pdf), "application/pdf");
  assert.equal(detectMimeFromBuffer(fake), null);
});
