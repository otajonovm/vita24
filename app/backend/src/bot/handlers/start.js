const { peekShopSettings, renderTemplate, DEFAULT_TEMPLATES } = require("../../lib/shopSettings");
const { mainMenuKeyboard, requestContactKeyboard } = require("../keyboards");
const { findUserByChatId } = require("../linkUser");
const { setExpectedPhone, takePending } = require("../pending");
const { sendOtpCode } = require("../services");
const { normalizeTelegramPhone } = require("../utils");

function askContactText() {
  return peekShopSettings()?.messageTemplates?.askContact || DEFAULT_TEMPLATES.askContact;
}

async function handleStart(ctx) {
  const chatId = String(ctx.from?.id || "");
  const payload = normalizeTelegramPhone(ctx.match);
  const user = await findUserByChatId(chatId);

  if (user && !user.deletedAt && user.role === "CUSTOMER" && user.status !== "SUSPENDED") {
    if (payload && payload !== user.phone) {
      await ctx.reply("Bu chat boshqa telefon raqamga ulangan. Asosiy menyudan foydalaning.", {
        reply_markup: mainMenuKeyboard(),
      });
      return;
    }
    const code = takePending(user.phone);
    if (code) await sendOtpCode(chatId, user.phone, code);
    await ctx.reply("Asosiy menyu", { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (payload) setExpectedPhone(chatId, payload);
  const text = payload
    ? renderTemplate(askContactText(), {})
    : "Assalomu alaykum! Vita24 botiga xush kelibsiz. Davom etish uchun telefon raqamingizni yuboring.";
  await ctx.reply(text, { reply_markup: requestContactKeyboard() });
}

function registerStart(bot) {
  bot.command("start", handleStart);
}

module.exports = { registerStart, handleStart };
