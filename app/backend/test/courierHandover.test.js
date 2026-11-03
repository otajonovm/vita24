const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../src/lib/prisma");
const { createHandover, settleHandover } = require("../src/services/courierService");

function phone(prefix, stamp) {
  return `+998${prefix}${String(stamp).slice(-7)}`;
}

async function buildFixture() {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const branch = await prisma.branch.create({
    data: {
      name: "QA filial",
      slug: `qa-handover-${stamp}`,
      address: "Test",
      phone: "+998700000001",
      district: "Test",
      workingHours: "09-18",
    },
  });
  const courier = await prisma.user.create({
    data: {
      name: "QA kuryer",
      phone: phone("90", stamp),
      passwordHash: "hash",
      role: "COURIER",
      courierBranches: { create: [{ branchId: branch.id }] },
    },
  });
  const pharmacist = await prisma.user.create({
    data: {
      name: "QA farmatsevt",
      phone: phone("91", stamp),
      passwordHash: "hash",
      role: "BRANCH_ADMIN",
      branchId: branch.id,
    },
  });

  async function makeOrder(amount = 85000) {
    return prisma.order.create({
      data: {
        orderNumber: `QA-${stamp}-${Math.random().toString(16).slice(2, 8)}`,
        branchId: branch.id,
        status: "COMPLETED",
        customerName: "Ali",
        customerPhone: "+998901112233",
        deliveryAddress: "Yunusobod",
        deliveryType: "DELIVERY",
        subtotal: amount,
        deliveryFee: 0,
        discount: 0,
        reservedUntil: new Date(Date.now() + 3600000),
        courierId: courier.id,
        courierStage: "DELIVERED",
        payment: { create: { amount, provider: "CASH", status: "COMPLETED" } },
        deliveryProofs: {
          create: { courierId: courier.id, method: "CASH", collectedAmount: amount },
        },
      },
    });
  }

  return { branch, courier, pharmacist, makeOrder };
}

async function cleanup(branch, users) {
  if (!branch) return;
  await prisma.auditLog.deleteMany({ where: { branchId: branch.id } });
  await prisma.cashHandover.deleteMany({ where: { branchId: branch.id } });
  await prisma.order.deleteMany({ where: { branchId: branch.id } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.delete({ where: { id: branch.id } }).catch(() => {});
}

test("parallel topshirish bitta PENDING handover qoldiradi", async () => {
  let branch;
  let users = [];
  try {
    const fixture = await buildFixture();
    branch = fixture.branch;
    users = [fixture.courier.id, fixture.pharmacist.id];
    const first = await fixture.makeOrder();
    const second = await fixture.makeOrder();
    const results = await Promise.allSettled([
      createHandover({ courierId: fixture.courier.id, orderIds: [first.id], amount: 85000 }),
      createHandover({ courierId: fixture.courier.id, orderIds: [second.id], amount: 85000 }),
    ]);
    const ok = results.filter((item) => item.status === "fulfilled");
    assert.equal(ok.length, 1);
    const pending = await prisma.cashHandover.count({
      where: { courierId: fixture.courier.id, status: "PENDING" },
    });
    assert.equal(pending, 1);
  } finally {
    await cleanup(branch, users);
  }
});

test("parallel tasdiqlash bir marta yoziladi", async () => {
  let branch;
  let users = [];
  try {
    const fixture = await buildFixture();
    branch = fixture.branch;
    users = [fixture.courier.id, fixture.pharmacist.id];
    const order = await fixture.makeOrder();
    const handover = await createHandover({
      courierId: fixture.courier.id,
      orderIds: [order.id],
      amount: 85000,
    });
    const req = { user: fixture.pharmacist, headers: {} };
    const results = await Promise.allSettled([
      settleHandover({
        id: handover.id,
        branchId: branch.id,
        user: fixture.pharmacist,
        req,
        mode: "confirm",
      }),
      settleHandover({
        id: handover.id,
        branchId: branch.id,
        user: fixture.pharmacist,
        req,
        mode: "confirm",
      }),
    ]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    const audits = await prisma.auditLog.count({
      where: { entityId: handover.id, action: "HANDOVER_CONFIRMED" },
    });
    assert.equal(audits, 1);
    const stored = await prisma.cashHandover.findUnique({ where: { id: handover.id } });
    assert.equal(stored.status, "CONFIRMED");
  } finally {
    await cleanup(branch, users);
  }
});

test("bahsli handoverdagi buyurtma qayta topshirilmaydi", async () => {
  let branch;
  let users = [];
  try {
    const fixture = await buildFixture();
    branch = fixture.branch;
    users = [fixture.courier.id, fixture.pharmacist.id];
    const order = await fixture.makeOrder();
    const handover = await createHandover({
      courierId: fixture.courier.id,
      orderIds: [order.id],
      amount: 1000,
    });
    await settleHandover({
      id: handover.id,
      branchId: branch.id,
      user: fixture.pharmacist,
      req: { user: fixture.pharmacist, headers: {} },
      mode: "dispute",
      note: "Summa mos emas",
    });
    await assert.rejects(
      () => createHandover({ courierId: fixture.courier.id, orderIds: [order.id], amount: 85000 }),
      (error) => error.statusCode === 409
    );
  } finally {
    await cleanup(branch, users);
  }
});
