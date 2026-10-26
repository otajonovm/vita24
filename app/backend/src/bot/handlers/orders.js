const { settledTotals } = require("../../lib/pricing");
const { BUTTONS, mainMenuKeyboard, requestContactKeyboard, orderDetailKeyboard } = require("../keyboards");
const { findUserByChatId } = require("../linkUser");
const { clearSearchMode } = require("../pending");
const { escapeHtml, formatSom, formatTashkent, orderStatusLabel } = require("../utils");

async function handleOrders(ctx) {
  clearSearchMode(ctx.from.id);
  const user = await findUserByChatId(ctx.from.id);
  if (!user || user.deletedAt || user.role !== "CUSTOMER") {
    await ctx.reply("Buyurtmalarni ko'rish uchun telefon raqamingizni yuboring.", {
      reply_markup: requestContactKeyboard(),
    });
    return;
  }

  const prisma = require("../../lib/prisma");
  const orders = await prisma.order.findMany({
    where: {
      OR: [{ userId: user.id }, { customerPhone: user.phone }],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { payment: true, prescription: true },
  });

  if (!orders.length) {
    await ctx.reply("Hali buyurtmangiz yo'q.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  for (const order of orders) {
    const total = settledTotals(order).totalAmount;
    const text = [
      `<b>${escapeHtml(order.orderNumber)}</b>`,
      escapeHtml(formatTashkent(order.createdAt)),
      escapeHtml(orderStatusLabel(order)),
      escapeHtml(formatSom(total)),
    ].join("\n");
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: orderDetailKeyboard(order.id),
    });
  }
}

function registerOrders(bot) {
  bot.hears(BUTTONS.orders, handleOrders);
}

module.exports = { registerOrders, handleOrders };
