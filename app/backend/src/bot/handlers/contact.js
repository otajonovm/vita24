const { customerBlockMessage } = require("../../lib/customerAccess");
const { mainMenuKeyboard, requestContactKeyboard } = require("../keyboards");
const { linkTelegramContact } = require("../linkUser");
const { getExpectedPhone, clearExpectedPhone, takePending } = require("../pending");
const { sendOtpCode } = require("../services");
const { isOwnContact, normalizeTelegramPhone } = require("../utils");

async function handleContact(ctx) {
  const contact = ctx.message?.contact || {};
  if (!isOwnContact(ctx.from.id, contact)) {
    await ctx.reply("Faqat o'z raqamingizni yuboring.");
    return;
  }

  const phone = normalizeTelegramPhone(contact.phone_number);
  if (!phone) {
    await ctx.reply("Raqam o'qilmadi. Telegramdagi +998 raqamingizni yuboring.", {
      reply_markup: requestContactKeyboard(),
    });
    return;
  }

  const chatId = String(ctx.from.id);
  const expected = getExpectedPhone(chatId);
  if (expected && expected !== phone) {
    await ctx.reply("Yuborgan raqam saytdagi raqam bilan mos emas. Saytda Telegramdagi raqamingizni kiriting.");
    return;
  }

  const result = await linkTelegramContact({
    chatId,
    phone,
    firstName: ctx.from?.first_name,
  });

  if (result.code === "STAFF") {
    await ctx.reply("Bu raqam xodim akkauntiga tegishli");
    return;
  }
  if (result.code === "SUSPENDED") {
    await ctx.reply(customerBlockMessage(result.reason));
    return;
  }
  if (result.code === "DELETED") {
    await ctx.reply("Bu raqam o'chirilgan hisobga tegishli. Qo'llab-quvvatlashga murojaat qiling.");
    return;
  }
  if (!result.ok) {
    await ctx.reply("Raqamni ulab bo'lmadi. Keyinroq urinib ko'ring.");
    return;
  }

  clearExpectedPhone(chatId);
  const code = takePending(phone);
  if (code) await sendOtpCode(chatId, phone, code);
  await ctx.reply("Muvaffaqiyatli ulandingiz!", { reply_markup: mainMenuKeyboard() });
}

function registerContact(bot) {
  bot.on("message:contact", handleContact);
}

module.exports = { registerContact, handleContact };
