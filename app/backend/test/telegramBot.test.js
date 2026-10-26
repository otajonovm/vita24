const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { normalizeTelegramPhone, isOwnContact, haversineKm, nearestBranches } = require("../src/bot/utils");
const { isSearchableMedicine, summarizeMedicine, buildSearchWhere } = require("../src/bot/searchMedicines");
const { linkTelegramContact } = require("../src/bot/linkUser");
const { verifyTelegramInitData } = require("../src/bot/initData");
const { deliverOtp, notifyCustomer } = require("../src/bot/services");
const { resetPendingState, takePending } = require("../src/bot/pending");

function memoryPrisma(seed = []) {
  const users = seed.map((row) => ({ ...row }));
  const api = {
    users,
    user: {
      async findUnique({ where }) {
        if (where.phone) return users.find((row) => row.phone === where.phone) || null;
        if (where.telegramChatId) {
          return users.find((row) => row.telegramChatId === where.telegramChatId) || null;
        }
        if (where.id) return users.find((row) => row.id === where.id) || null;
        return null;
      },
      async findFirst({ where }) {
        return (
          users.find((row) => {
            if (where.phone && row.phone !== where.phone) return false;
            if (where.telegramChatId && row.telegramChatId !== where.telegramChatId) return false;
            if (where.deletedAt === null && row.deletedAt) return false;
            return true;
          }) || null
        );
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of users) {
          if (where.telegramChatId && row.telegramChatId !== where.telegramChatId) continue;
          if (where.NOT?.id && row.id === where.NOT.id) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
      async update({ where, data }) {
        const row = users.find((item) => item.id === where.id || item.phone === where.phone);
        Object.assign(row, data);
        return row;
      },
      async create({ data }) {
        const row = {
          id: `u-${users.length + 1}`,
          status: "ACTIVE",
          deletedAt: null,
          role: "CUSTOMER",
          blockReason: null,
          ...data,
        };
        users.push(row);
        return row;
      },
    },
    async $transaction(work) {
      return work(api);
    },
  };
  return api;
}

function signInitData(fields, token) {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

test("telefon raqami +998XXXXXXXXX ga normallanadi", () => {
  assert.equal(normalizeTelegramPhone("90 123 45 67"), "+998901234567");
  assert.equal(normalizeTelegramPhone("998901234567"), "+998901234567");
  assert.equal(normalizeTelegramPhone("+99890 123-45-67"), "+998901234567");
  assert.equal(normalizeTelegramPhone("123"), "");
});

test("begona kontakt rad etiladi", () => {
  assert.equal(isOwnContact(10, { user_id: 10 }), true);
  assert.equal(isOwnContact(10, { user_id: 99 }), false);
  assert.equal(isOwnContact(10, {}), false);
});

test("xodim raqami telegramga bog'lanmaydi", async () => {
  const db = memoryPrisma([
    {
      id: "staff-1",
      phone: "+998901111111",
      role: "BRANCH_ADMIN",
      status: "ACTIVE",
      deletedAt: null,
      telegramChatId: null,
    },
  ]);
  const result = await linkTelegramContact(
    { chatId: "555", phone: "+998901111111", firstName: "Ali" },
    db
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "STAFF");
  assert.equal(db.users[0].telegramChatId, null);
});

test("mavjud mijozga chatId yoziladi va boshqa userdan olinadi", async () => {
  const db = memoryPrisma([
    {
      id: "old",
      phone: "+998901000001",
      role: "CUSTOMER",
      status: "ACTIVE",
      deletedAt: null,
      telegramChatId: "42",
    },
    {
      id: "cust",
      phone: "+998901000002",
      role: "CUSTOMER",
      status: "ACTIVE",
      deletedAt: null,
      telegramChatId: null,
    },
  ]);
  const result = await linkTelegramContact(
    { chatId: "42", phone: "+998901000002", firstName: "Nodira" },
    db
  );
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(db.users.find((row) => row.id === "cust").telegramChatId, "42");
  assert.equal(db.users.find((row) => row.id === "old").telegramChatId, null);
});

test("yangi mijoz bcrypt parol hashi bilan yaratiladi", async () => {
  const db = memoryPrisma([]);
  const result = await linkTelegramContact(
    { chatId: "777", phone: "+998909999999", firstName: "Dilshod" },
    db
  );
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.user.phone, "+998909999999");
  assert.equal(result.user.name, "Dilshod");
  assert.equal(result.user.telegramChatId, "777");
  assert.equal(result.user.role, "CUSTOMER");
  assert.match(result.user.passwordHash, /^\$2[aby]?\$/);
  assert.equal(await bcrypt.compare("not-used", result.user.passwordHash), false);
});

test("qidiruv faqat faol va qoldiqli dorilarni oladi", () => {
  const active = {
    isActive: true,
    stocks: [{ stockCount: 4, price: 12000, branch: { isActive: true, name: "Yunusobod" } }],
  };
  const inactive = {
    isActive: false,
    stocks: [{ stockCount: 9, price: 1000, branch: { isActive: true, name: "Yunusobod" } }],
  };
  const empty = {
    isActive: true,
    stocks: [{ stockCount: 0, price: 9000, branch: { isActive: true, name: "Yunusobod" } }],
  };
  const closedBranch = {
    isActive: true,
    stocks: [{ stockCount: 5, price: 9000, branch: { isActive: false, name: "Yopiq" } }],
  };
  assert.equal(isSearchableMedicine(active), true);
  assert.equal(isSearchableMedicine(inactive), false);
  assert.equal(isSearchableMedicine(empty), false);
  assert.equal(isSearchableMedicine(closedBranch), false);
  const summary = summarizeMedicine({ id: "1", name: "Paracetamol", ...active });
  assert.equal(summary.price, 12000);
  assert.equal(summary.branchCount, 1);
  const where = buildSearchWhere("para");
  assert.equal(where.isActive, true);
  assert.equal(where.stocks.some.stockCount.gt, 0);
  assert.equal(where.stocks.some.branch.isActive, true);
});

test("haversine eng yaqin filialni topadi", () => {
  assert.equal(haversineKm(41.3, 69.24, 41.3, 69.24), 0);
  const oneDegree = haversineKm(0, 0, 0, 1);
  assert.ok(oneDegree > 110 && oneDegree < 113);

  const nearest = nearestBranches(
    { lat: 41.3, lng: 69.24 },
    [
      { name: "Uzoq", isActive: true, lat: 41.9, lng: 69.9 },
      { name: "Yaqin", isActive: true, lat: 41.31, lng: 69.25 },
      { name: "O'rta", isActive: true, lat: 41.4, lng: 69.3 },
      { name: "Yopiq", isActive: false, lat: 41.3001, lng: 69.2401 },
      { name: "Koordsiz", isActive: true, lat: null, lng: null },
    ],
    3
  );
  assert.equal(nearest.length, 3);
  assert.equal(nearest[0].name, "Yaqin");
  assert.ok(nearest[0].distanceKm < nearest[1].distanceKm);
});

test("initData imzosi to'g'ri, noto'g'ri va eskirgan holatlarni ajratadi", () => {
  const token = "123456:TEST-TOKEN";
  const nowSec = Math.floor(Date.now() / 1000);
  const fields = {
    auth_date: String(nowSec),
    query_id: "AAE",
    user: JSON.stringify({ id: 42, first_name: "Ali" }),
  };
  const valid = signInitData(fields, token);
  const ok = verifyTelegramInitData(valid, token);
  assert.equal(ok.ok, true);
  assert.equal(ok.user.id, 42);

  const tampered = valid.replace(/hash=/, "hash=ab");
  assert.equal(verifyTelegramInitData(tampered, token).ok, false);
  assert.equal(verifyTelegramInitData(tampered, token).code, "INVALID");

  const stale = signInitData({ ...fields, auth_date: String(nowSec - 25 * 60 * 60) }, token);
  const expired = verifyTelegramInitData(stale, token);
  assert.equal(expired.ok, false);
  assert.equal(expired.code, "EXPIRED");
});

test("deliverOtp va notifyCustomer telegramChatId orqali yuboradi", async () => {
  resetPendingState();
  const db = memoryPrisma([
    {
      id: "c1",
      phone: "+998901234567",
      telegramChatId: "9001",
      deletedAt: null,
      role: "CUSTOMER",
    },
  ]);
  const sent = [];
  const io = {
    prisma: db,
    sendMessage: async (chatId, text) => {
      sent.push({ chatId, text });
    },
  };

  const delivered = await deliverOtp("+998901234567", "654321", io);
  assert.equal(delivered.ok, true);
  assert.equal(sent[0].chatId, "9001");
  assert.match(sent[0].text, /654321/);

  const notified = await notifyCustomer("+998901234567", "Buyurtmangiz tayyor", io);
  assert.equal(notified.ok, true);
  assert.equal(sent[1].chatId, "9001");
  assert.equal(sent[1].text, "Buyurtmangiz tayyor");

  const waiting = await deliverOtp("+998908888888", "111111", io);
  assert.equal(waiting.ok, false);
  assert.equal(waiting.code, "AWAITING_CONTACT");
  assert.equal(takePending("+998908888888"), "111111");
});
