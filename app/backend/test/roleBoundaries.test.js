const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "x".repeat(48);
process.env.LEKKO_KEY_SECRET = "y".repeat(48);
process.env.NODE_ENV = "test";

const { canTransition, allowedTransitions } = require("../src/lib/orderState");
const { assertBranchAccess, requireBranchAdminWrite } = require("../src/middlewares/authMiddleware");
const { AppError } = require("../src/lib/response");
const { issueOtp, resetOtpStore } = require("../src/lib/otpStore");
const { assertRuntimeSecrets } = require("../src/lib/secrets");

test("super admin faqat CANCELLED qila oladi", () => {
  assert.equal(canTransition({ from: "PAID", to: "PREPARING", role: "SUPER_ADMIN" }), false);
  assert.equal(canTransition({ from: "PREPARING", to: "READY", role: "SUPER_ADMIN" }), false);
  assert.equal(canTransition({ from: "READY", to: "DELIVERING", role: "SUPER_ADMIN" }), false);
  assert.equal(canTransition({ from: "DELIVERING", to: "COMPLETED", role: "SUPER_ADMIN" }), false);
  assert.equal(canTransition({ from: "PAID", to: "CANCELLED", role: "SUPER_ADMIN" }), true);
  assert.equal(canTransition({ from: "COMPLETED", to: "CANCELLED", role: "SUPER_ADMIN" }), false);
  assert.deepEqual(allowedTransitions({ from: "PAID", role: "SUPER_ADMIN" }), ["CANCELLED"]);
});

test("PENDING_PRESCRIPTION dan to'g'ridan-to'g'ri WAITING_PAYMENT yo'q", () => {
  assert.equal(
    canTransition({ from: "PENDING_PRESCRIPTION", to: "WAITING_PAYMENT", role: "BRANCH_ADMIN" }),
    false
  );
  assert.equal(
    canTransition({ from: "PENDING_PRESCRIPTION", to: "CANCELLED", role: "BRANCH_ADMIN" }),
    true
  );
});

test("assertBranchAccess yozuvda SUPER_ADMIN ga 403", () => {
  const req = { user: { role: "SUPER_ADMIN", id: "a1" } };
  assert.equal(assertBranchAccess(req, "branch-1"), "branch-1");
  assert.throws(
    () => assertBranchAccess(req, "branch-1", { write: true }),
    (err) => err instanceof AppError && err.statusCode === 403 && /farmatsevt/i.test(err.message)
  );
});

test("requireBranchAdminWrite SUPER_ADMIN ni rad etadi", () => {
  const guard = requireBranchAdminWrite;
  let status = 0;
  let body = null;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  guard({ user: { role: "SUPER_ADMIN" } }, res, () => {
    throw new Error("next chaqirilmasligi kerak");
  });
  assert.equal(status, 403);
  assert.equal(body?.error?.code, "FORBIDDEN");

  let nextCalled = false;
  guard({ user: { role: "BRANCH_ADMIN", branchId: "b1" } }, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("ENABLE_DEV_OTP yo'q bo'lsa devCode qaytmaydi", () => {
  resetOtpStore();
  const prev = process.env.ENABLE_DEV_OTP;
  delete process.env.ENABLE_DEV_OTP;
  const issued = issueOtp("+998901110001");
  assert.equal(issued.devCode, undefined);
  assert.ok(issued.code);
  process.env.ENABLE_DEV_OTP = prev;
});

test("ENABLE_DEV_OTP=true bo'lsa devCode bor", () => {
  resetOtpStore();
  process.env.ENABLE_DEV_OTP = "true";
  const issued = issueOtp("+998901110002");
  assert.equal(issued.devCode, issued.code);
});

test("productionda ENABLE_MOCK_PAY yoki ENABLE_DEV_OTP serverni to'xtatadi", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevMock = process.env.ENABLE_MOCK_PAY;
  const prevOtp = process.env.ENABLE_DEV_OTP;
  process.env.NODE_ENV = "production";
  process.env.ENABLE_MOCK_PAY = "true";
  process.env.ENABLE_DEV_OTP = "false";
  assert.throws(() => assertRuntimeSecrets(), /ENABLE_MOCK_PAY/);
  process.env.ENABLE_MOCK_PAY = "false";
  process.env.ENABLE_DEV_OTP = "true";
  assert.throws(() => assertRuntimeSecrets(), /ENABLE_DEV_OTP/);
  process.env.NODE_ENV = prevEnv;
  process.env.ENABLE_MOCK_PAY = prevMock;
  process.env.ENABLE_DEV_OTP = prevOtp;
});
