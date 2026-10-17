const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "x".repeat(48);
process.env.LEKKO_KEY_SECRET = "y".repeat(48);
process.env.CLICK_SERVICE_ID = "12345";
process.env.CLICK_SECRET_KEY = "click-secret-value";
process.env.PAYME_MERCHANT_ID = "Paycom";
process.env.PAYME_SECRET_KEY = "payme-secret-value";
process.env.NODE_ENV = "test";
process.env.JWT_EXPIRES_IN = "7d";
process.env.ADMIN_JWT_EXPIRES_IN = "12h";
process.env.ENABLE_DEV_OTP = "true";

const { isWeakSecret, encryptSecret, decryptSecret, maskSecret } = require("../src/lib/secrets");
const { canTransition, describeTransition, unpaidCash } = require("../src/lib/orderState");
const { buildClickSign, verifyClickSignature, verifyPaymeAuth } = require("../src/lib/clickSign");
const { assertPrescriptionFile } = require("../src/lib/prescriptionFiles");
const { issueOtp, verifyOtp, resetOtpStore } = require("../src/lib/otpStore");
const { authenticateToken, requireRole } = require("../src/middlewares/authMiddleware");

test("zaif JWT rad etiladi", () => {
  assert.equal(isWeakSecret("change-me-to-a-long-random-secret"), true);
  assert.equal(isWeakSecret("short"), true);
  assert.equal(isWeakSecret("x".repeat(48)), false);
});

test("LEKKO kaliti AES-GCM bilan qayta ochiladi", () => {
  const encrypted = encryptSecret("lekko-live-key");
  assert.match(encrypted, /^enc:v1:/);
  assert.equal(decryptSecret(encrypted), "lekko-live-key");
  assert.equal(decryptSecret("plain-legacy"), "plain-legacy");
});

test("buyurtma holati faqat ruxsat etilgan o'tishda o'zgaradi", () => {
  // Retsept → keyingi holat faqat verify-prescription orqali
  assert.equal(
    canTransition({ from: "PENDING_PRESCRIPTION", to: "WAITING_PAYMENT", role: "BRANCH_ADMIN" }),
    false
  );
  assert.equal(
    canTransition({ from: "PENDING_PRESCRIPTION", to: "REJECTED", role: "SUPER_ADMIN" }),
    true
  );
  assert.equal(
    canTransition({ from: "PENDING_PRESCRIPTION", to: "WAITING_PAYMENT", role: "CUSTOMER" }),
    false
  );
  assert.equal(canTransition({ from: "PAID", to: "COMPLETED", role: "SUPER_ADMIN" }), false);
  assert.equal(canTransition({ from: "PAID", to: "PREPARING", role: "SUPER_ADMIN" }), false);
  assert.equal(canTransition({ from: "PAID", to: "CANCELLED", role: "SUPER_ADMIN" }), true);
  assert.equal(canTransition({ from: "PAID", to: "DELIVERING", role: "BRANCH_ADMIN" }), false);
  assert.equal(canTransition({ from: "PAID", to: "PREPARING", role: "BRANCH_ADMIN" }), true);
  assert.equal(canTransition({ from: "PREPARING", to: "READY", role: "BRANCH_ADMIN" }), true);
  assert.equal(canTransition({ from: "READY", to: "DELIVERING", role: "BRANCH_ADMIN" }), true);
  assert.equal(canTransition({ from: "READY", to: "COMPLETED", role: "BRANCH_ADMIN" }), false);
  assert.equal(canTransition({ from: "READY", to: "COMPLETED", role: "BRANCH_ADMIN", deliveryType: "PICKUP" }), true);
  assert.equal(canTransition({ from: "READY", to: "DELIVERING", role: "BRANCH_ADMIN", deliveryType: "PICKUP" }), false);
  assert.equal(canTransition({ from: "DELIVERING", to: "COMPLETED", role: "BRANCH_ADMIN" }), true);
  assert.equal(canTransition({ from: "PAID", to: "CANCELLED", role: "BRANCH_ADMIN" }), true);
  assert.equal(canTransition({ from: "PAID", to: "CANCELLED", role: "CUSTOMER" }), true);
  assert.equal(canTransition({ from: "PENDING_PRESCRIPTION", to: "CANCELLED", role: "CUSTOMER" }), true);
  assert.equal(canTransition({ from: "PENDING_BRANCH", to: "CANCELLED", role: "CUSTOMER" }), true);
  assert.equal(canTransition({ from: "PREPARING", to: "CANCELLED", role: "CUSTOMER" }), false);
  assert.equal(canTransition({ from: "DELIVERING", to: "CANCELLED", role: "CUSTOMER" }), false);
  assert.equal(canTransition({ from: "PENDING_PRESCRIPTION", to: "PREPARING", role: "BRANCH_ADMIN" }), false);
  assert.equal(canTransition({ from: "PENDING_BRANCH", to: "PREPARING", role: "SUPER_ADMIN" }), false);
  assert.equal(
    canTransition({
      from: "DELIVERING",
      to: "COMPLETED",
      role: "BRANCH_ADMIN",
      payment: { provider: "CASH", status: "PENDING" },
    }),
    false
  );
  assert.equal(
    canTransition({
      from: "READY",
      to: "COMPLETED",
      role: "BRANCH_ADMIN",
      deliveryType: "PICKUP",
      payment: { provider: "CASH", status: "COMPLETED" },
    }),
    true
  );
  assert.equal(unpaidCash({ provider: "CASH", status: "PENDING" }), true);
  assert.equal(unpaidCash({ provider: "CLICK", status: "PENDING" }), false);
  assert.deepEqual(describeTransition("PENDING_PRESCRIPTION", "REJECTED"), {
    status: "CANCELLED",
    rejected: true,
  });
});

test("Click imzosi noto'g'ri bo'lsa rad etiladi", () => {
  const body = {
    click_trans_id: "100",
    service_id: "12345",
    merchant_trans_id: "order-1",
    amount: "15000.00",
    action: "0",
    sign_time: "2026-10-15 12:00:00",
    sign_string: "bad",
  };
  assert.equal(verifyClickSignature(body, 0).ok, false);

  body.sign_string = buildClickSign({
    clickTransId: body.click_trans_id,
    serviceId: "12345",
    secretKey: "click-secret-value",
    merchantTransId: body.merchant_trans_id,
    amount: body.amount,
    action: 0,
    signTime: body.sign_time,
  });
  assert.equal(verifyClickSignature(body, 0).ok, true);
});

test("Payme Basic auth tekshiriladi", () => {
  const token = Buffer.from("Paycom:payme-secret-value").toString("base64");
  assert.equal(verifyPaymeAuth(`Basic ${token}`), true);
  assert.equal(verifyPaymeAuth("Basic bm90OnZhbGlk"), false);
});

test("retsept faqat JPG PNG PDF va 5 MB gacha", () => {
  assert.doesNotThrow(() => assertPrescriptionFile({ mimetype: "image/jpeg", size: 1024 }));
  assert.throws(() => assertPrescriptionFile({ mimetype: "image/webp", size: 1024 }), /JPG/);
  assert.throws(() => assertPrescriptionFile({ mimetype: "application/pdf", size: 6 * 1024 * 1024 }), /5 MB/);
});

test("OTP bir marta ishlatiladi", () => {
  resetOtpStore();
  const issued = issueOtp("+998901112233");
  assert.equal(verifyOtp("+998901112233", "000000").ok, false);
  assert.equal(verifyOtp("+998901112233", issued.devCode).ok, true);
  assert.equal(verifyOtp("+998901112233", issued.devCode).ok, false);
});

test("yangi OTP xato urinishlardan keyin ham ishlaydi", () => {
  resetOtpStore();
  const phone = "+998901110099";
  issueOtp(phone);
  for (let i = 0; i < 6; i += 1) verifyOtp(phone, "000000");
  const next = issueOtp(phone);
  assert.equal(verifyOtp(phone, next.devCode).ok, true);
});

test("mijoz tokeni branch-admin ni ochmaydi", () => {
  const gate = requireRole("BRANCH_ADMIN", "SUPER_ADMIN");
  const denied = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return payload;
    },
  };
  let opened = false;
  gate({ user: { role: "CUSTOMER" } }, denied, () => {
    opened = true;
  });
  assert.equal(opened, false);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.error.code, "FORBIDDEN");

  const allowed = { statusCode: 200, status() { return this; }, json() { return this; } };
  gate({ user: { role: "BRANCH_ADMIN" } }, allowed, () => {
    opened = true;
  });
  assert.equal(opened, true);
});

test("tokensiz so'rov 401", async () => {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return payload;
    },
  };
  await authenticateToken({ headers: {} }, res, () => {
    throw new Error("next chaqirilmasligi kerak");
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, "UNAUTHORIZED");
});

test("LEKKO kaliti javobda ochilmaydi va bo'sh qiymat o'chirmaydi", () => {
  const { lekkoKeyData } = require("../src/controllers/adminBranchController");
  const stored = encryptSecret("secret-key-1234");
  const masked = maskSecret(stored);
  assert.deepEqual(masked, { hasLekkoKey: true, lekkoKeyLast4: "1234" });
  assert.equal(JSON.stringify(masked).includes("secret-key"), false);
  assert.deepEqual(maskSecret("enc:v1:broken"), { hasLekkoKey: true, lekkoKeyLast4: null });
  assert.equal(lekkoKeyData(undefined), undefined);
  assert.equal(lekkoKeyData(null), undefined);
  assert.equal(lekkoKeyData("   "), undefined);
  assert.match(lekkoKeyData("fresh-key"), /^enc:v1:/);
});

test("500 javobi ichki xabarni yashiradi", () => {
  const { errorHandler } = require("../src/middlewares/errorHandler");
  const original = console.error;
  console.error = () => {};
  const res = {
    headersSent: false,
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return payload;
    },
  };
  try {
    errorHandler(
      new Error("postgres password=secret-detail"),
      { id: "req-1", method: "GET", originalUrl: "/api/orders" },
      res,
      () => {}
    );
  } finally {
    console.error = original;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, "INTERNAL_ERROR");
  assert.equal(res.body.error.message, "Serverda xatolik");
  assert.equal(res.body.error.requestId, "req-1");
  assert.equal(JSON.stringify(res.body).includes("secret-detail"), false);
});

test("GET /orders status=FOO 400", () => {
  const { listOrdersQuerySchema } = require("../src/validators/orderValidator");
  const { validateRequest } = require("../src/middlewares/validateRequest");
  assert.throws(() => listOrdersQuerySchema.parse({ status: "FOO" }));
  assert.throws(() => listOrdersQuerySchema.parse({ page: "0" }));
  assert.throws(() => listOrdersQuerySchema.parse({ from: "2026-02-31" }));
  assert.throws(() => listOrdersQuerySchema.parse({ branchId: "bad id" }));
  const parsed = listOrdersQuerySchema.parse({
    status: "PAID",
    branchId: "branch-yunusobod",
    page: "2",
    from: "2026-10-01",
  });
  assert.equal(parsed.status, "PAID");
  assert.equal(parsed.page, 2);

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return payload;
    },
  };
  let opened = false;
  validateRequest(listOrdersQuerySchema, "query")({ query: { status: "FOO" } }, res, () => {
    opened = true;
  });
  assert.equal(opened, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, "VALIDATION_ERROR");
});

test("admin marshrutlari requireRole bilan yopiq", () => {
  const adminRouter = require("../src/routes/admin");
  const medicineRouter = require("../src/routes/adminMedicines");

  function collect(router) {
    const globalChecks = [];
    const routes = [];
    for (const layer of router.stack) {
      if (layer.route) {
        const checks = layer.route.stack.map((sub) => sub.handle?.allowedRoles).filter(Boolean);
        routes.push({ path: layer.route.path, checks });
      } else if (layer.handle?.allowedRoles) {
        globalChecks.push(layer.handle.allowedRoles);
      }
    }
    return { globalChecks, routes };
  }

  function effective(globalChecks, checks) {
    const all = [...globalChecks, ...checks];
    if (!all.length) return [];
    return all.slice(1).reduce((acc, roles) => acc.filter((role) => roles.includes(role)), [...all[0]]);
  }

  const admin = collect(adminRouter);
  assert.ok(admin.routes.length >= 8);
  const managerRead = new Set(["/dashboard", "/reports/:kind"]);
  for (const route of admin.routes) {
    const roles = effective(admin.globalChecks, route.checks).slice().sort();
    if (managerRead.has(route.path)) {
      assert.deepEqual(roles, ["MANAGER", "SUPER_ADMIN"], route.path);
    } else {
      assert.deepEqual(roles, ["SUPER_ADMIN"], route.path);
    }
  }

  const medicines = collect(medicineRouter);
  const image = medicines.routes.find((route) => route.path === "/:id/image");
  const home = medicines.routes.find((route) => route.path === "/:id/home");
  assert.ok(image);
  assert.deepEqual(effective(medicines.globalChecks, image.checks), ["SUPER_ADMIN"]);
  assert.deepEqual(effective(medicines.globalChecks, home.checks), ["SUPER_ADMIN"]);

  const imageGuard = image.checks.find((roles) => roles.length === 1 && roles[0] === "SUPER_ADMIN");
  assert.ok(imageGuard);
  const denied = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return payload;
    },
  };
  const guard = require("../src/middlewares/authMiddleware").requireRole(...imageGuard);
  let opened = false;
  guard({ user: { role: "BRANCH_ADMIN" } }, denied, () => {
    opened = true;
  });
  assert.equal(opened, false);
  assert.equal(denied.statusCode, 403);
});

test("super admin tokeni 12 soat va sessiya bilan", () => {
  const jwt = require("jsonwebtoken");
  const { signAccessToken } = require("../src/controllers/authController");
  const adminToken = signAccessToken(
    { id: "admin-1", role: "SUPER_ADMIN", branchId: null },
    { sid: "sess-1" }
  );
  const adminPayload = jwt.decode(adminToken);
  assert.equal(adminPayload.sid, "sess-1");
  assert.equal(adminPayload.exp - adminPayload.iat, 12 * 60 * 60);

  const staffToken = signAccessToken({ id: "ph-1", role: "BRANCH_ADMIN", branchId: "branch-yunusobod" });
  const staffPayload = jwt.decode(staffToken);
  assert.equal(staffPayload.sid, undefined);
  assert.equal(staffPayload.exp - staffPayload.iat, 7 * 24 * 60 * 60);
});

test("trust proxy faqat TRUST_PROXY bilan yoqiladi", () => {
  const { trustProxyValue } = require("../src/lib/trustProxy");
  const previous = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  assert.equal(trustProxyValue(), false);
  assert.equal(trustProxyValue("1"), 1);
  assert.equal(trustProxyValue("false"), false);
  if (previous == null) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = previous;
});

test("TOTP kod tasdiqlanadi", () => {
  const { totpCode, verifyTotp, generateTotpSecret } = require("../src/lib/totp");
  const rfc = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpCode(rfc, 59 * 1000), "287082");
  const secret = generateTotpSecret();
  const code = totpCode(secret);
  assert.equal(verifyTotp(secret, code), true);
  assert.equal(verifyTotp(secret, "000000"), false);
});

test("login limiti telefon va IP bo'yicha alohida", () => {
  const { staffLoginLimiter, buckets } = require("../src/lib/rateLimit");
  buckets.clear();

  function attempt(phone, ip) {
    const res = {
      statusCode: 200,
      body: null,
      set() {
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return payload;
      },
    };
    let opened = false;
    staffLoginLimiter({ body: { phone }, ip }, res, () => {
      opened = true;
    });
    return { opened, statusCode: res.statusCode };
  }

  for (let index = 0; index < 10; index += 1) {
    assert.equal(attempt("+998901110088", `10.9.0.${index}`).opened, true);
  }
  assert.equal(attempt("+998901110088", "10.9.0.50").statusCode, 429);

  for (let index = 0; index < 30; index += 1) {
    const phone = `+99891${String(index).padStart(7, "0")}`;
    assert.equal(attempt(phone, "10.8.0.8").opened, true);
  }
  assert.equal(attempt("+998919999999", "10.8.0.8").statusCode, 429);
  buckets.clear();
});

test("menejer faqat ko'rish ruxsatiga ega", () => {
  const { hasPermission } = require("../src/lib/permissions");
  const { isStaffPassword } = require("../src/lib/staffPassword");
  const { assertAssignableBranch } = require("../src/controllers/adminUserController");
  assert.equal(hasPermission("MANAGER", "orders.read"), true);
  assert.equal(hasPermission("MANAGER", "prescriptions.read"), true);
  assert.equal(hasPermission("MANAGER", "reports.read"), true);
  assert.equal(hasPermission("MANAGER", "branches.manage"), false);
  assert.equal(hasPermission("MANAGER", "staff.manage"), false);
  assert.equal(hasPermission("SUPER_ADMIN", "staff.manage"), true);
  assert.equal(isStaffPassword("qisqa1"), false);
  assert.equal(isStaffPassword("12345678"), false);
  assert.equal(isStaffPassword("harflargina"), false);
  assert.equal(isStaffPassword("Vita24a1"), true);
  assert.throws(() => assertAssignableBranch({ id: "b", isActive: false, archivedAt: null }), /faol filial/);
  assert.equal(assertAssignableBranch({ id: "b", isActive: true, archivedAt: null }).id, "b");
});

test("retsept kaliti faqat yuklagan mijozniki", () => {
  const fs = require("fs");
  const {
    absolutePath,
    ownsPrescriptionKey,
    prescriptionKeyOwner,
    savePrescriptionBuffer,
  } = require("../src/lib/prescriptionFiles");
  const key = savePrescriptionBuffer({
    buffer: Buffer.from("%PDF-1.4"),
    mimetype: "application/pdf",
    userId: "customer-a",
  });
  try {
    assert.equal(prescriptionKeyOwner(key), "customer-a");
    assert.equal(ownsPrescriptionKey(key, "customer-a"), true);
    assert.equal(ownsPrescriptionKey(key, "customer-b"), false);
    assert.equal(prescriptionKeyOwner("rx/plain.pdf"), null);
  } finally {
    const full = absolutePath(key);
    if (full && fs.existsSync(full)) fs.unlinkSync(full);
  }
});
