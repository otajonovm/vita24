const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);
process.env.LEKKO_KEY_SECRET = process.env.LEKKO_KEY_SECRET || "y".repeat(48);

const { requireRole } = require("../src/middlewares/authMiddleware");
const { hasPermission } = require("../src/lib/permissions");
const { branchWriteSchema, staffStatusSchema } = require("../src/validators/adminValidator");
const { slugify } = require("../src/lib/branchProfile");
const { assertAssignableBranch } = require("../src/controllers/adminUserController");
const { maskSecret } = require("../src/lib/secrets");
const { errorHandler } = require("../src/middlewares/errorHandler");
const { assertPromo, releasePromo } = require("../src/lib/promo");
const { summarizeDashboard } = require("../src/lib/dashboardStats");
const { writeAudit, sanitizeAudit } = require("../src/lib/audit");

function denyRes() {
  return {
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
}

test("BRANCH_ADMIN va menejer admin amallarini bajara olmaydi", () => {
  const guard = requireRole("SUPER_ADMIN");
  for (const role of ["BRANCH_ADMIN", "MANAGER", "OPERATOR"]) {
    const res = denyRes();
    let opened = false;
    guard({ user: { role } }, res, () => {
      opened = true;
    });
    assert.equal(opened, false, role);
    assert.equal(res.statusCode, 403, role);
    assert.equal(hasPermission(role, "branches.manage"), false, role);
    assert.equal(hasPermission(role, "staff.manage"), false, role);
  }
  assert.equal(hasPermission("SUPER_ADMIN", "staff.manage"), true);
});

test("Lekko kaliti javob maydoniga tushmaydi", () => {
  const stored = "enc:v1:aaaa.bbbb.cccc";
  const masked = maskSecret(stored);
  const response = { hasLekkoKey: masked.hasLekkoKey, lekkoKeyLast4: masked.lekkoKeyLast4 };
  assert.equal(JSON.stringify(response).includes(stored), false);
  assert.equal(response.lekkoApiKey, undefined);
});

test("500 javobi ichki matnni qaytarmaydi", () => {
  const original = console.error;
  console.error = () => {};
  const res = denyRes();
  try {
    errorHandler(new Error("relation User password=secret-detail"), { id: "req-9", method: "GET", originalUrl: "/api/admin" }, res, () => {});
  } finally {
    console.error = original;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.stringify(res.body).includes("secret-detail"), false);
  assert.equal(res.body.error.message, "Serverda xatolik");
});

test("filial yozuvi va slug tekshiriladi", () => {
  assert.throws(() => branchWriteSchema.parse({ name: "Sinov", address: "Manzil", phone: "901112233" }));
  const parsed = branchWriteSchema.parse({
    name: "Sinov filial",
    slug: "sinov-filial",
    address: "Sinov ko'chasi 1",
    phone: "+998901112233",
  });
  assert.equal(parsed.slug, "sinov-filial");
  assert.equal(slugify("Sinov filiali"), "sinov-filiali");
  assert.equal(slugify("  "), "");
});

test("nofaol filialga xodim biriktirilmaydi", () => {
  assert.throws(() => assertAssignableBranch({ id: "branch-sinov", isActive: false, archivedAt: null }), /faol filial/);
  assert.throws(() => assertAssignableBranch({ id: "branch-sinov", isActive: true, archivedAt: new Date() }), /topilmadi/);
  assert.equal(assertAssignableBranch({ id: "branch-sinov", isActive: true, archivedAt: null }).id, "branch-sinov");
});

test("xodimni to'xtatish faqat ACTIVE yoki SUSPENDED", () => {
  assert.equal(staffStatusSchema.parse({ status: "SUSPENDED" }).status, "SUSPENDED");
  assert.equal(staffStatusSchema.parse({ status: "ACTIVE" }).status, "ACTIVE");
  assert.throws(() => staffStatusSchema.parse({ status: "DELETED" }));
});

test("promokod limiti va usedCount qaytishi", async () => {
  const promo = {
    active: true,
    type: "AMOUNT",
    value: 1000,
    usedCount: 1,
    usageLimit: 1,
    minSubtotal: 0,
    allBranches: true,
  };
  assert.throws(() => assertPromo(promo, 10000));

  let used = 1;
  const tx = {
    promoRedemption: {
      findUnique: async () => ({ id: "red-1", promoId: "promo-1", releasedAt: null }),
      updateMany: async () => ({ count: 1 }),
    },
    promoCode: {
      updateMany: async () => {
        used -= 1;
        return { count: 1 };
      },
    },
  };
  await releasePromo(tx, { id: "order-1", promoCode: "VITA10" });
  assert.equal(used, 0);
});

test("dashboard tushumi faqat to'langan buyurtmalarga teng", () => {
  const summary = summarizeDashboard({
    from: "2026-10-16",
    to: "2026-10-16",
    branches: [{ id: "branch-a", name: "A" }],
    orders: [
      {
        id: "paid",
        orderNumber: "P",
        branchId: "branch-a",
        branch: { id: "branch-a", name: "A" },
        status: "COMPLETED",
        subtotal: 4000,
        deliveryFee: 0,
        discount: 0,
        refundStatus: "NONE",
        createdAt: "2026-10-16T08:00:00+05:00",
        updatedAt: "2026-10-16T08:00:00+05:00",
        payment: { amount: 4000, provider: "CLICK", status: "COMPLETED", paidAt: "2026-10-16T08:05:00+05:00" },
        items: [],
        history: [],
      },
      {
        id: "cash-due",
        orderNumber: "C",
        branchId: "branch-a",
        branch: { id: "branch-a", name: "A" },
        status: "PREPARING",
        subtotal: 9000,
        deliveryFee: 0,
        discount: 0,
        refundStatus: "NONE",
        createdAt: "2026-10-16T09:00:00+05:00",
        updatedAt: "2026-10-16T09:00:00+05:00",
        payment: { amount: 9000, provider: "CASH", status: "PENDING", paidAt: null },
        items: [],
        history: [],
      },
    ],
  });
  assert.equal(summary.summary.revenueTotal, 4000);
  assert.equal(summary.summary.paidCount, 1);
  assert.equal(summary.summary.orderCount, 2);
});

test("audit yozuvi rol, oldin va keyin holatni saqlaydi", async () => {
  let saved = null;
  const tx = {
    auditLog: {
      create: async ({ data }) => {
        saved = data;
        return data;
      },
    },
  };
  await writeAudit(tx, {
    req: { user: { id: "user-super-admin", name: "Vita24 Super Admin", role: "SUPER_ADMIN" }, headers: { "user-agent": "test" }, ip: "127.0.0.1" },
    action: "STAFF_STATUS",
    entityType: "User",
    entityId: "user-sinov",
    summary: "Sinov xodim: SUSPENDED",
    before: { status: "ACTIVE", password: "yashirin" },
    after: { status: "SUSPENDED" },
  });
  assert.equal(saved.role, "SUPER_ADMIN");
  assert.equal(saved.userId, "user-super-admin");
  assert.equal(saved.action, "STAFF_STATUS");
  assert.equal(saved.before.status, "ACTIVE");
  assert.equal(saved.before.password, "[yashirilgan]");
  assert.equal(saved.after.status, "SUSPENDED");
  assert.equal(sanitizeAudit({ lekkoApiKey: "enc:v1:secret" }).lekkoApiKey, "[yashirilgan]");
});
