const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "x".repeat(48);
process.env.LEKKO_KEY_SECRET = "y".repeat(48);
process.env.NODE_ENV = "test";

const { quoteTotals, DELIVERY_FEE } = require("../src/lib/pricing");
const { discountAmount, assertPromo } = require("../src/lib/promo");
const {
  PAYMENT_WINDOW_MS,
  REVIEW_WINDOW_MS,
  reservationDeadline,
  reservationForNextStatus,
} = require("../src/lib/stock");
const { buckets, otpRequestLimiter, otpVerifyLimiter, staffLoginLimiter, promoCheckLimiter, resetOtpVerify } = require("../src/lib/rateLimit");
const { canReadPrescription } = require("../src/controllers/prescriptionController");
const { searchVariants } = require("../src/lib/searchText");
const { getCustomerOrderView, initialCustomerStatus } = require("../src/lib/customerOrderView");

function mockRes() {
  const handlers = {};
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set() {
      return this;
    },
    json() {
      return this;
    },
    on(event, fn) {
      handlers[event] = fn;
    },
    finish() {
      handlers.finish?.();
    },
  };
}

function runLimiter(limiter, req, res) {
  return new Promise((resolve) => {
    limiter(req, res, () => resolve(false));
    if (res.statusCode === 429) resolve(true);
  });
}

test("buyurtma jami mahsulot va yetkazishni qo'shadi", () => {
  const quote = quoteTotals(49800);
  assert.equal(quote.deliveryFee, DELIVERY_FEE);
  assert.equal(quote.totalAmount, 64800);
  assert.equal(quoteTotals(200000).deliveryFee, 0);
  assert.equal(quoteTotals(49800, { deliveryType: "PICKUP" }).deliveryFee, 0);
  assert.equal(quoteTotals(49800, { discount: 5000 }).totalAmount, 59800);
  assert.equal(discountAmount({ type: "PERCENT", value: 10 }, 50000), 5000);
  assert.equal(discountAmount({ type: "PERCENT", value: 10, maxDiscount: 3000 }, 50000), 3000);
  assert.equal(discountAmount({ type: "AMOUNT", value: 80000 }, 50000), 50000);
  assert.throws(() => assertPromo({ active: false, type: "AMOUNT", value: 1000, usedCount: 0, minSubtotal: 0 }, 10000));
  const limited = { active: true, type: "AMOUNT", value: 1000, usedCount: 0, minSubtotal: 0, perUserLimit: 1, allBranches: false, branches: [{ branchId: "branch-a" }] };
  assert.equal(assertPromo(limited, 10000, new Date(), { branchId: "branch-a", userUses: 0 }), 1000);
  assert.throws(() => assertPromo(limited, 10000, new Date(), { branchId: "branch-b", userUses: 0 }));
  assert.throws(() => assertPromo(limited, 10000, new Date(), { branchId: "branch-a", userUses: 1 }));
  assert.throws(() => assertPromo({ ...limited, allBranches: true, startsAt: new Date(Date.now() + 60_000) }, 10000));
});

test("tasdiqlangach to'lov oynasi 15 daqiqa, tekshiruv alohida", () => {
  const start = Date.now();
  const payment = reservationDeadline("payment").getTime() - start;
  const review = reservationDeadline("review").getTime() - start;
  assert.ok(payment >= PAYMENT_WINDOW_MS - 20 && payment <= PAYMENT_WINDOW_MS + 20);
  assert.ok(review >= REVIEW_WINDOW_MS - 20 && review <= REVIEW_WINDOW_MS + 20);
  const approved = reservationForNextStatus("WAITING_PAYMENT");
  const delivering = reservationForNextStatus("DELIVERING");
  assert.ok(approved.getTime() - Date.now() >= PAYMENT_WINDOW_MS - 20);
  assert.equal(delivering, null);
});

test("OTP, tasdiqlash va xodim kirishi alohida limitlanadi", async () => {
  buckets.clear();
  const otpReq = { body: { phone: "+998901112233" }, ip: "10.0.0.1" };
  const verify = { body: { phone: "+998901112233" }, ip: "10.0.0.1" };
  const login = { body: { phone: "+998901000002" }, ip: "10.0.0.1" };

  for (let i = 0; i < 3; i += 1) {
    const res = mockRes();
    assert.equal(await runLimiter(otpRequestLimiter, otpReq, res), false);
    res.statusCode = 200;
    res.finish();
  }
  assert.equal(await runLimiter(otpRequestLimiter, otpReq, mockRes()), true);
  assert.equal(await runLimiter(staffLoginLimiter, login, mockRes()), false);

  for (let i = 0; i < 5; i += 1) {
    const res = mockRes();
    assert.equal(await runLimiter(otpVerifyLimiter, verify, res), false);
    res.statusCode = 401;
    res.finish();
  }
  assert.equal(await runLimiter(otpVerifyLimiter, verify, mockRes()), true);

  const success = mockRes();
  buckets.clear();
  assert.equal(await runLimiter(otpVerifyLimiter, verify, success), false);
  success.statusCode = 200;
  success.finish();
  for (let i = 0; i < 5; i += 1) {
    assert.equal(await runLimiter(otpVerifyLimiter, verify, mockRes()), false);
  }
});

test("promokod tekshiruvi 20 tadan keyin to'xtaydi", async () => {
  buckets.clear();
  const req = { user: { id: "user-promo" }, ip: "10.1.1.1" };
  for (let i = 0; i < 20; i += 1) {
    assert.equal(await runLimiter(promoCheckLimiter, req, mockRes()), false);
  }
  assert.equal(await runLimiter(promoCheckLimiter, req, mockRes()), true);
  assert.equal(await runLimiter(promoCheckLimiter, { user: { id: "user-other" }, ip: "10.1.1.1" }, mockRes()), false);
});

test("OTP limiti telefon va IP bo'yicha, yangi kod hisoblagichni tozalaydi", async () => {
  buckets.clear();
  const phone = "+998901119999";
  const verify = { body: { phone }, ip: "10.1.1.1" };
  const otherIp = { body: { phone }, ip: "10.2.2.2" };
  for (let i = 0; i < 5; i += 1) {
    const res = mockRes();
    assert.equal(await runLimiter(otpVerifyLimiter, verify, res), false);
    res.statusCode = 401;
    res.finish();
  }
  const blocked = mockRes();
  let body = null;
  blocked.json = (payload) => {
    body = payload;
    return blocked;
  };
  assert.equal(await runLimiter(otpVerifyLimiter, verify, blocked), true);
  assert.equal(body.error.code, "RATE_LIMIT");
  assert.ok(body.error.retryAfter >= 1);
  assert.equal(await runLimiter(otpVerifyLimiter, otherIp, mockRes()), false);
  resetOtpVerify(phone);
  assert.equal(await runLimiter(otpVerifyLimiter, verify, mockRes()), false);
});

test("retsept faylini faqat egasi, filial farmatsevti va super admin ko'radi", () => {
  const prescription = {
    userId: "customer-1",
    order: { branchId: "branch-yunusobod", customerPhone: "+998901110000" },
  };
  assert.equal(canReadPrescription({ role: "SUPER_ADMIN" }, prescription), true);
  assert.equal(
    canReadPrescription({ role: "BRANCH_ADMIN", branchId: "branch-yunusobod" }, prescription),
    true
  );
  assert.equal(
    canReadPrescription({ role: "BRANCH_ADMIN", branchId: "branch-chilonzor" }, prescription),
    false
  );
  assert.equal(
    canReadPrescription({ id: "customer-1", role: "CUSTOMER", phone: "+998900000000" }, prescription),
    true
  );
  assert.equal(
    canReadPrescription({ id: "other", role: "CUSTOMER", phone: "+998901110000" }, prescription),
    true
  );
  assert.equal(
    canReadPrescription({ id: "other", role: "CUSTOMER", phone: "+998900000099" }, prescription),
    false
  );
});

test("naqd buyurtma to'lov kutmaydi va mijoz holati zid chiqmaydi", () => {
  assert.deepEqual(initialCustomerStatus({ hasRx: false, paymentMethod: "cash" }), {
    status: "PREPARING",
    reservation: "none",
    capture: true,
  });
  assert.equal(initialCustomerStatus({ hasRx: true, paymentMethod: "CASH" }).status, "PENDING_PRESCRIPTION");
  assert.equal(initialCustomerStatus({ hasRx: false, paymentMethod: "CLICK" }).status, "WAITING_PAYMENT");

  const cash = getCustomerOrderView({
    status: "PREPARING",
    payment: { provider: "CASH", status: "PENDING" },
  });
  assert.equal(cash.showPay, false);
  assert.equal(cash.showPayTimer, false);
  assert.equal(cash.reservationKey, null);
  assert.equal(cash.paymentKey, "order.pay.cashDue");

  const cashPaid = getCustomerOrderView({
    status: "DELIVERING",
    payment: { provider: "CASH", status: "COMPLETED" },
  });
  assert.equal(cashPaid.paymentKey, "order.pay.cashReceived");

  const cashFailed = getCustomerOrderView({
    status: "PREPARING",
    payment: { provider: "CASH", status: "FAILED" },
  });
  assert.equal(cashFailed.paymentKey, "order.pay.cashDue");

  const online = getCustomerOrderView({
    status: "WAITING_PAYMENT",
    payment: { provider: "PAYME", status: "PENDING" },
  });
  assert.equal(online.showPay, true);
  assert.equal(online.reservationKey, "order.reserve.payment");
  assert.equal(online.paymentKey, "order.pay.payme");

  const review = getCustomerOrderView({
    status: "PENDING_PRESCRIPTION",
    payment: { provider: "CASH", status: "PENDING" },
    prescription: { status: "PENDING" },
  });
  assert.equal(review.reservationKey, "order.reserve.review");
  assert.equal(review.showPay, false);
  assert.equal(review.prescriptionKey, "order.rx.pending");

  const rejected = getCustomerOrderView({
    status: "CANCELLED",
    notes: "Muhr yo'q",
    payment: { provider: "CLICK", status: "FAILED" },
    prescription: {
      status: "REJECTED",
      rejectReasons: JSON.stringify(["NO_STAMP", "OTHER"]),
      rejectNote: "Skan xira",
    },
  });
  assert.equal(rejected.titleKey, "order.status.rxRejected");
  assert.equal(rejected.showReupload, true);
  assert.equal(rejected.prescriptionKey, null);
  assert.equal(rejected.cancelReason, null);
  assert.deepEqual(
    rejected.reasons.map((item) => item.code),
    ["NO_STAMP", "OTHER"]
  );
  assert.equal(rejected.reasons[1].note, "Skan xira");

  const cancelled = getCustomerOrderView({
    status: "CANCELLED",
    notes: "Mijoz voz kechdi",
    payment: { provider: "CLICK", status: "PENDING" },
    prescription: { status: "APPROVED" },
  });
  assert.equal(cancelled.titleKey, "order.status.cancelled");
  assert.equal(cancelled.prescriptionKey, null);
  assert.equal(cancelled.cancelReason, "Mijoz voz kechdi");
  assert.equal(cancelled.paymentKey, "order.pay.click");
});

test("qidiruv lotin va kirill variantlarini beradi", () => {
  const variants = searchVariants("paras");
  assert.ok(variants.includes("para"));
  assert.ok(variants.some((item) => /[а-яёқғҳў]/i.test(item)));
});
