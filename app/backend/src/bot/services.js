const { peekShopSettings, renderTemplate, DEFAULT_TEMPLATES } = require("../lib/shopSettings");
const { getToken } = require("./token");
const { botUrl, currentBotUsername, startLinkFor, setBotUsername } = require("./identity");
const { rememberPending, takePending } = require("./pending");
const { findChatIdByPhone } = require("./linkUser");
const { normalizeTelegramPhone } = require("./utils");

function defaultPrisma() {
  return require("../lib/prisma");
}

function otpText(phone, code) {
  const template = peekShopSettings()?.messageTemplates?.otp || DEFAULT_TEMPLATES.otp;
  return renderTemplate(template, { code, phone });
}

async function callTelegramApi(method, body, timeoutMs = 10000) {
  const secret = getToken();
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

async function sendMessage(chatId, text, extra = {}, io = {}) {
  if (io.sendMessage) return io.sendMessage(chatId, text, extra);
  await callTelegramApi("sendMessage", { chat_id: chatId, text, ...extra });
}

async function ensureBotUsername() {
  if (currentBotUsername()) return currentBotUsername();
  try {
    const me = await callTelegramApi("getMe", {}, 10000);
    setBotUsername(me?.username || "");
  } catch {
    // username ixtiyoriy — havola keyinroq ham ishlashi mumkin
  }
  return currentBotUsername();
}

async function sendOtpCode(chatId, phone, code, io) {
  await sendMessage(chatId, otpText(phone, code), {}, io);
}

async function deliverOtp(phone, code, io = {}) {
  const tokenOk = Boolean(getToken());
  if (!tokenOk && !io.sendMessage) return { ok: false, code: "NOT_CONFIGURED" };

  if (!io.sendMessage) await ensureBotUsername().catch(() => {});
  const db = io.prisma || defaultPrisma();
  const normalized = normalizeTelegramPhone(phone) || phone;
  const chatId = await findChatIdByPhone(normalized, db);
  if (chatId) {
    await sendOtpCode(chatId, normalized, code, io);
    return { ok: true };
  }

  rememberPending(normalized, code);
  return { ok: false, code: "AWAITING_CONTACT", botUrl: startLinkFor(normalized) };
}

async function notifyCustomer(phone, text, io = {}) {
  if (!phone || !text) return { ok: false };
  if (!getToken() && !io.sendMessage) return { ok: false };

  const db = io.prisma || defaultPrisma();
  const normalized = normalizeTelegramPhone(phone) || phone;
  const chatId = await findChatIdByPhone(normalized, db);
  if (!chatId) return { ok: false, code: "NOT_BOUND" };
  try {
    await sendMessage(chatId, text, {}, io);
    return { ok: true };
  } catch (error) {
    console.error("[telegram] mijozga xabar yuborilmadi:", error.message);
    return { ok: false };
  }
}

module.exports = {
  deliverOtp,
  notifyCustomer,
  botUrl,
  currentBotUsername,
  sendMessage,
  sendOtpCode,
  otpText,
  callTelegramApi,
  takePending,
};
