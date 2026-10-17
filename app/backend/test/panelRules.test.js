const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret-value";
process.env.LEKKO_KEY_SECRET = process.env.LEKKO_KEY_SECRET || "test-lekko-secret-value";

const {
  stockCountError,
  restoresStockOnCancel,
  releasesReservationOnCancel,
  refundStatusForCancel,
  closedBranchMessage,
  pageWindow,
  canUndo,
  freeForLine,
  resubmitExpired,
  reviewBlockReason,
} = require("../src/lib/panelRules");
const { undoBlockReason } = require("../src/lib/orderFlow");
const { canTransition } = require("../src/lib/orderState");
const { updateStockSchema, verifyPrescriptionSchema, orderStatusSchema, refundSchema } = require("../src/validators/branchAdminValidator");

test("qoldiq manfiy, kasr, bo'sh va 100000 dan katta qiymatni rad etadi", () => {
  assert.match(stockCountError(""), /kiriting/i);
  assert.match(stockCountError(-5), /manfiy/i);
  assert.match(stockCountError(2.5), /butun/i);
  assert.match(stockCountError(100001), /100000/);
  assert.match(stockCountError(true), /butun/i);
  assert.match(stockCountError([9]), /butun/i);
  assert.match(stockCountError("7"), /butun/i);
  assert.match(stockCountError("1e3"), /butun/i);
  assert.equal(stockCountError(0), null);
  assert.equal(stockCountError(12), null);
  assert.throws(() => updateStockSchema.parse({ stockCount: "", reason: "kirim" }));
  assert.throws(() => updateStockSchema.parse({ stockCount: true, reason: "kirim" }));
  assert.throws(() => updateStockSchema.parse({ stockCount: [9], reason: "kirim" }));
  assert.throws(() => updateStockSchema.parse({ stockCount: "7", reason: "kirim" }));
  assert.throws(() => updateStockSchema.parse({ stockCount: 2.5, reason: "kirim" }));
  assert.throws(() => updateStockSchema.parse({ stockCount: -5, reason: "kirim" }));
  assert.throws(() => updateStockSchema.parse({ stockCount: 100001, reason: "kirim" }));
  assert.throws(() => updateStockSchema.parse({ stockCount: 4 }));
});

test("to'langan buyurtma bekor qilinsa ombor qaytadi, to'lovdan oldin emas", () => {
  for (const status of ["PAID", "PREPARING", "READY", "DELIVERING"]) {
    assert.equal(restoresStockOnCancel(status), true);
    assert.equal(canTransition({ from: status, to: "CANCELLED", role: "BRANCH_ADMIN" }), true);
  }
  assert.equal(restoresStockOnCancel("WAITING_PAYMENT"), false);
  assert.equal(canTransition({ from: "WAITING_PAYMENT", to: "CANCELLED", role: "CUSTOMER" }), true);
});

test("tasdiqlashdan oldin retsept rad etish sababi majburiy", () => {
  assert.throws(() => verifyPrescriptionSchema.parse({ action: "REJECT" }));
  assert.throws(() => verifyPrescriptionSchema.parse({ action: "REJECT", rejectReasons: ["OTHER"] }));
  assert.equal(
    verifyPrescriptionSchema.parse({ action: "REJECT", rejectReasons: ["NO_STAMP", "OTHER"], rejectNote: "noaniq" }).rejectReasons.length,
    2
  );
  assert.equal(verifyPrescriptionSchema.parse({ action: "APPROVE" }).action, "APPROVE");
  assert.throws(() => verifyPrescriptionSchema.parse({ action: "APPROVE", decision: "yes" }));
});

test("yopiq filial xabari ochilish vaqtini ko'rsatadi", () => {
  const { slugify } = require("../src/lib/branchProfile");
  const { branchWriteSchema } = require("../src/validators/adminValidator");
  assert.equal(closedBranchMessage({ isOpen: true, workingHours: "08:00-22:00" }), null);
  assert.equal(
    closedBranchMessage({ isOpen: false, workingHours: "08:00-22:00" }),
    "Filial hozir yopiq, ochilish vaqti 08:00"
  );
  const friday = new Date("2026-10-16T08:00:00+05:00");
  const hours = {
    mon: { open: "09:00", close: "21:00", closed: false },
    tue: { open: "09:00", close: "21:00", closed: false },
    wed: { open: "09:00", close: "21:00", closed: false },
    thu: { open: "09:00", close: "21:00", closed: false },
    fri: { open: "10:15", close: "20:00", closed: false },
    sat: { open: "11:00", close: "18:00", closed: false },
    sun: { open: "11:00", close: "18:00", closed: true },
  };
  assert.equal(
    closedBranchMessage({ isOpen: false, workingHours: hours }, friday),
    "Filial hozir yopiq, ochilish vaqti 10:15"
  );
  assert.equal(closedBranchMessage({ isOpen: false, workingHours: { allDay: true } }, friday), "Filial hozir yopiq");
  assert.equal(slugify("Юнусобод"), "yunusobod");
  assert.equal(slugify("Синов филиали"), "sinov-filiali");
  assert.throws(() => branchWriteSchema.parse({ name: "A", address: "B", phone: "998901112233" }));
  assert.equal(
    branchWriteSchema.parse({ name: "A", address: "B", phone: "+998901112233", workingHours: { allDay: true } }).phone,
    "+998901112233"
  );
});

test("sahifa 20 tadan olinadi", () => {
  assert.deepEqual(pageWindow({}), { page: 1, limit: 20, skip: 0 });
  assert.deepEqual(pageWindow({ page: "2", limit: "20" }), { page: 2, limit: 20, skip: 20 });
  assert.equal(pageWindow({ limit: "500" }).limit, 50);
});

test("oxirgi holat 30 soniyadan keyin qaytarilmaydi", () => {
  const now = Date.now();
  const recent = { userId: "user-1", createdAt: new Date(now - 10 * 1000) };
  const late = { userId: "user-1", createdAt: new Date(now - 31 * 1000) };
  assert.equal(canUndo(recent, "user-1", now), true);
  assert.equal(canUndo(late, "user-1", now), false);
  assert.equal(canUndo(recent, "user-2", now), false);
  assert.equal(canUndo({ ...recent, kind: "undo" }, "user-1", now), false);
  assert.equal(canUndo({ ...recent, kind: "system" }, "user-1", now), false);
});

test("bekor qilish zaxira yoki omborni holatga qarab qaytaradi", () => {
  for (const status of ["PENDING_PRESCRIPTION", "WAITING_PAYMENT"]) {
    assert.equal(releasesReservationOnCancel(status), true);
    assert.equal(restoresStockOnCancel(status), false);
    assert.equal(refundStatusForCancel({ status, payment: { provider: "CLICK", status: "PENDING" } }), null);
  }
  assert.equal(
    refundStatusForCancel({ status: "PAID", payment: { provider: "CLICK", status: "COMPLETED" } }),
    "PENDING"
  );
  assert.equal(
    refundStatusForCancel({ status: "PREPARING", payment: { provider: "CASH", status: "COMPLETED" } }),
    "PENDING"
  );
  assert.equal(
    refundStatusForCancel({ status: "READY", payment: { provider: "CASH", status: "PENDING" } }),
    "NOT_REQUIRED"
  );
});

test("bekor qilingan va yakunlangan buyurtmani tasdiqlash taqiqlanadi", () => {
  assert.equal(reviewBlockReason({ status: "COMPLETED", prescription: { status: "APPROVED" } }), "Yakunlangan buyurtmani tasdiqlab bo'lmaydi");
  assert.match(reviewBlockReason({ status: "CANCELLED", prescription: { status: "REJECTED" } }), /Rad etilgan/);
  assert.equal(
    reviewBlockReason({ status: "WAITING_PAYMENT", prescription: { status: "APPROVED" } }),
    "Retsept allaqachon tasdiqlangan"
  );
  assert.equal(reviewBlockReason({ status: "PENDING_PRESCRIPTION", prescription: { status: "PENDING" } }), null);
  const old = { status: "CANCELLED", prescription: { status: "PENDING" }, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) };
  assert.match(reviewBlockReason(old), /muddati/);
  const fresh = { status: "CANCELLED", prescription: { status: "PENDING" }, createdAt: new Date() };
  assert.equal(reviewBlockReason(fresh), null);
});

test("tasdiqlash bo'sh qoldiq bo'yicha hisoblanadi", () => {
  assert.equal(freeForLine({ stockCount: 10, reservedCount: 4 }, 2), 8);
  assert.equal(freeForLine({ stockCount: 3, reservedCount: 3 }, 0), 0);
  assert.equal(canTransition({ from: "PENDING_PRESCRIPTION", to: "PREPARING", role: "BRANCH_ADMIN" }), false);
  assert.equal(canTransition({ from: "CANCELLED", to: "WAITING_PAYMENT", role: "BRANCH_ADMIN" }), false);
});

test("rad etilgan buyurtmani qayta yuborish muddati cheklangan", () => {
  const fresh = { statusChangedAt: new Date(), prescription: { status: "REJECTED" } };
  assert.equal(resubmitExpired(fresh), false);
  const old = { statusChangedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), prescription: { status: "REJECTED" } };
  assert.equal(resubmitExpired(old), true);
});

test("ikkinchi undo zaxiraga tegmaydi", () => {
  const now = Date.now();
  const undoRow = { kind: "undo", userId: "user-1", createdAt: new Date(now - 1000), fromStatus: "CANCELLED", toStatus: "PENDING_PRESCRIPTION" };
  assert.match(undoBlockReason(undoRow, "user-1", now), /qaytarib bo'lmaydi/);
  const real = { kind: "status", userId: "user-1", createdAt: new Date(now - 1000) };
  assert.equal(undoBlockReason(real, "user-1", now), null);
});

test("pul qaytarish va bekor sababi tekshiriladi", () => {
  assert.equal(refundSchema.parse({ status: "DONE", note: "karta" }).status, "DONE");
  assert.throws(() => refundSchema.parse({ status: "PENDING" }));
  assert.throws(() => orderStatusSchema.parse({ status: "CANCELLED", reason: "OTHER" }));
  assert.equal(orderStatusSchema.parse({ status: "CANCELLED", reason: "OTHER", note: "sabab" }).note, "sabab");
  assert.equal(orderStatusSchema.parse({ status: "CANCELLED", reason: "OUT_OF_STOCK" }).reason, "OUT_OF_STOCK");
});
