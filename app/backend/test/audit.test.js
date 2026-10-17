const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeAudit } = require("../src/lib/audit");

test("audit yozuvi parol va kalitni saqlamaydi", () => {
  const clean = sanitizeAudit({
    name: "Yunusobod",
    password: "MaxfiyParol1",
    passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
    lekkoApiKey: "enc:v1:aaaa.bbbb.cccc",
    telegramBotToken: "123456:ABCDEF",
    hasTelegramToken: true,
    telegramTokenLast4: "CDEF",
    basePrice: 12000,
  });
  assert.equal(clean.name, "Yunusobod");
  assert.equal(clean.password, "[yashirilgan]");
  assert.equal(clean.passwordHash, "[yashirilgan]");
  assert.equal(clean.lekkoApiKey, "[yashirilgan]");
  assert.equal(clean.telegramBotToken, "[yashirilgan]");
  assert.equal(clean.hasTelegramToken, true);
  assert.equal(clean.telegramTokenLast4, "CDEF");
  assert.equal(clean.basePrice, 12000);
  assert.equal(JSON.stringify(clean).includes("MaxfiyParol1"), false);
  assert.equal(JSON.stringify(clean).includes("enc:v1:"), false);
});
