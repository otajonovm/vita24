const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(__dirname, "../../private/telegram-otp.json");
const CODE_TTL_MS = 5 * 60 * 1000;

let offset = 0;
let started = false;
let botUsername = "";
const pendingCodes = new Map();
const expectedPhone = new Map();

const { peekShopSettings, renderTemplate, DEFAULT_TEMPLATES } = require("./shopSettings");

function token() {
  const fromSettings = String(peekShopSettings()?.telegramToken || "").trim();
  if (fromSettings) return fromSettings;
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

function template(key) {
  return peekShopSettings()?.messageTemplates?.[key] || DEFAULT_TEMPLATES[key];
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(patch) {
  const current = readStore();
  const next = {
    phones: current.phones && typeof current.phones === "object" ? current.phones : {},
    offset: Number(current.offset) || 0,
    ...patch,
  };
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(next));
}

function phones() {
  const stored = readStore().phones;
  return stored && typeof stored === "object" ? stored : {};
}

function normalizeLoose(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length >= 12) return `+${digits.slice(0, 12)}`;
  if (digits.length === 9) return `+998${digits}`;
  return "";
}

function chatForPhone(phone) {
  const chatId = phones()[phone];
  return chatId ? String(chatId) : "";
}

function phoneForChat(chatId) {
  const entries = Object.entries(phones());
  const found = entries.find(([, value]) => String(value) === String(chatId));
  return found ? found[0] : "";
}

function savePhone(phone, chatId) {
  const current = phones();
  if (String(current[phone] || "") === String(chatId)) return;
  writeStore({ phones: { ...current, [phone]: String(chatId) } });
}

function loadOffset() {
  const stored = Number(readStore().offset);
  offset = Number.isFinite(stored) && stored > 0 ? stored : 0;
}

function persistOffset() {
  if (Number(readStore().offset) === offset) return;
  writeStore({ offset });
}

function rememberPending(phone, code) {
  pendingCodes.set(phone, { code, expiresAt: Date.now() + CODE_TTL_MS });
}

function takePending(phone) {
  const row = pendingCodes.get(phone);
  if (!row || row.expiresAt <= Date.now()) {
    pendingCodes.delete(phone);
    return "";
  }
  pendingCodes.delete(phone);
  return row.code;
}

function linkFor(phone) {
  if (!botUsername) return "";
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://t.me/${botUsername}?start=${digits}` : `https://t.me/${botUsername}`;
}

function currentBotUsername() {
  return botUsername || String(process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();
}

function botUrl() {
  const name = currentBotUsername();
  return name ? `https://t.me/${name}` : "";
}

async function callApi(method, body, timeoutMs) {
  const secret = token();
  if (!secret) {
    const error = new Error("TELEGRAM_BOT_TOKEN yo'q");
    error.code = "NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`https://api.telegram.org/bot${secret}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!payload.ok) {
    const error = new Error(payload.description || "Telegram so'rovi rad etildi");
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

async function sendMessage(targetChatId, text, extra = {}) {
  await callApi("sendMessage", { chat_id: targetChatId, text, ...extra }, 10000);
}

async function ensureBot() {
  if (botUsername || !token()) return;
  const me = await callApi("getMe", {}, 10000);
  botUsername = me?.username || "";
}

function codeText(phone, code) {
  return renderTemplate(template("otp"), { code, phone });
}

async function sendCode(chatId, phone, code) {
  await sendMessage(chatId, codeText(phone, code), {
    reply_markup: { remove_keyboard: true },
  });
}

async function askContact(chatId, text) {
  await sendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[{ text: "Telefon raqamni yuborish", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

async function deliverOtp(phone, code) {
  if (!token()) return { ok: false, code: "NOT_CONFIGURED" };
  await ensureBot();

  const target = chatForPhone(phone);
  if (target) {
    await sendCode(target, phone, code);
    return { ok: true };
  }

  rememberPending(phone, code);
  return { ok: false, code: "AWAITING_CONTACT", botUrl: linkFor(phone) };
}

async function handleContact(chatId, message) {
  const contact = message.contact || {};
  if (contact.user_id && String(contact.user_id) !== String(message.from?.id)) {
    await sendMessage(chatId, "Faqat o'zingizning telefon raqamingizni yuboring.");
    return;
  }

  const phone = normalizeLoose(contact.phone_number);
  if (!phone) {
    await askContact(chatId, "Raqam o'qilmadi. Telegramdagi +998 raqamingizni yuboring.");
    return;
  }

  const expected = expectedPhone.get(chatId);
  if (expected && expected !== phone) {
    await sendMessage(
      chatId,
      "Yuborgan raqam saytdagi raqam bilan mos emas. Saytda Telegramdagi raqamingizni kiriting."
    );
    return;
  }

  savePhone(phone, chatId);
  expectedPhone.delete(chatId);
  const code = takePending(phone);
  if (code) await sendCode(chatId, phone, code);
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message?.chat?.id) return;
  const chatId = String(message.chat.id);

  if (message.contact) {
    await handleContact(chatId, message);
    return;
  }

  const text = String(message.text || "");
  if (!text.startsWith("/start")) return;

  const requested = normalizeLoose(text.split(/\s+/)[1] || "");
  const boundPhone = phoneForChat(chatId);
  if (boundPhone && (!requested || requested === boundPhone)) {
    const code = takePending(boundPhone);
    if (code) await sendCode(chatId, boundPhone, code);
    return;
  }

  if (requested) expectedPhone.set(chatId, requested);
  await askContact(chatId, renderTemplate(template("askContact"), {}));
}

async function poll() {
  if (!token()) return;
  try {
    const updates = await callApi("getUpdates", { offset, timeout: 25 }, 35000);
    for (const update of updates || []) {
      offset = update.update_id + 1;
      persistOffset();
      await handleUpdate(update);
    }
  } catch (error) {
    if (error.name !== "TimeoutError" && error.name !== "AbortError") {
      console.error("[telegram]", error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, error.status === 409 ? 5000 : 2000));
  }
  if (started) setTimeout(poll, 0);
}

function startTelegramBot() {
  if (started || process.env.NODE_ENV === "test") return;
  if (!token()) {
    console.log("[telegram] Token topilmadi. OTP hozircha sahifada qoladi.");
    return;
  }
  started = true;
  loadOffset();
  callApi("getMe", {}, 10000)
    .then((me) => {
      botUsername = me?.username || "";
      console.log(`[telegram] OTP bot tayyor${botUsername ? `: @${botUsername}` : ""}`);
    })
    .catch((error) => {
      console.error("[telegram] Botni tekshirib bo'lmadi:", error.message);
    })
    .finally(() => {
      poll();
    });
}

async function notifyCustomer(phone, text) {
  if (!token() || !phone || !text) return { ok: false };
  const chatId = chatForPhone(phone);
  if (!chatId) return { ok: false, code: "NOT_BOUND" };
  try {
    await sendMessage(chatId, text);
    return { ok: true };
  } catch (error) {
    console.error("[telegram] mijozga xabar yuborilmadi:", error.message);
    return { ok: false };
  }
}

module.exports = {
  deliverOtp,
  notifyCustomer,
  startTelegramBot,
  botUrl,
  currentBotUsername,
};
