const {
  BUTTONS,
  isMenuButtonText,
  medicineInlineKeyboard,
} = require("../keyboards");
const { enterSearchMode, inSearchMode } = require("../pending");
const {
  searchMedicines,
  formatMedicineCard,
  formatBranchStocks,
  summarizeMedicine,
} = require("../searchMedicines");

async function askSearchQuery(ctx) {
  enterSearchMode(ctx.from.id);
  await ctx.reply("Dori nomini yozing");
}

async function replySearch(ctx, query) {
  const result = await searchMedicines(query);
  if (result.code === "TOO_SHORT") {
    await ctx.reply("Kamida 2 ta belgi yozing.");
    return;
  }
  if (!result.items.length) {
    await ctx.reply("Bunday dori topilmadi. Nomini boshqacha yozib ko'ring.");
    return;
  }
  for (const item of result.items) {
    await ctx.reply(formatMedicineCard(item), {
      parse_mode: "HTML",
      reply_markup: medicineInlineKeyboard(item),
    });
  }
}

async function handleSearchCommand(ctx) {
  const query = String(ctx.match || "").trim();
  if (!query) {
    await askSearchQuery(ctx);
    return;
  }
  enterSearchMode(ctx.from.id);
  await replySearch(ctx, query);
}

async function handleSearchText(ctx, next) {
  const text = String(ctx.message?.text || "");
  if (isMenuButtonText(text)) return next();
  if (!inSearchMode(ctx.from.id)) return next();
  await replySearch(ctx, text);
}

async function handleBranchesCallback(ctx) {
  const medicineId = String(ctx.match?.[1] || "").trim();
  await ctx.answerCallbackQuery().catch(() => {});
  const prisma = require("../../lib/prisma");
  const medicine = await prisma.medicine.findFirst({
    where: {
      id: medicineId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      dosage: true,
      dosageForm: true,
      isPrescription: true,
      isActive: true,
      stocks: {
        where: { stockCount: { gt: 0 }, branch: { isActive: true } },
        select: {
          price: true,
          stockCount: true,
          branch: {
            select: { id: true, name: true, address: true, isActive: true, lowStockThreshold: true },
          },
        },
      },
    },
  });
  if (!medicine) {
    await ctx.reply("Bu dori topilmadi yoki endi mavjud emas.");
    return;
  }
  await ctx.reply(formatBranchStocks(summarizeMedicine(medicine)), { parse_mode: "HTML" });
}

function registerSearch(bot) {
  bot.hears(BUTTONS.search, askSearchQuery);
  bot.command("search", handleSearchCommand);
  bot.callbackQuery(/^br:(.+)$/, handleBranchesCallback);
  bot.on("message:text", handleSearchText);
}

module.exports = {
  registerSearch,
  askSearchQuery,
  handleSearchCommand,
  handleSearchText,
  handleBranchesCallback,
};
