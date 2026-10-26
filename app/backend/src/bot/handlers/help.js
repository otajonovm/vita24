const { peekShopSettings } = require("../../lib/shopSettings");
const { BUTTONS, mainMenuKeyboard } = require("../keyboards");
const { publicSiteUrl } = require("../identity");
const { clearSearchMode } = require("../pending");
const { escapeHtml } = require("../utils");

async function handleHelp(ctx) {
  clearSearchMode(ctx.from.id);
  const settings = peekShopSettings() || {};
  const prisma = require("../../lib/prisma");
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { name: true, workingHours: true, phone: true },
    orderBy: { name: "asc" },
    take: 5,
  });

  const lines = ["<b>Aloqa / Yordam</b>"];
  if (settings.contactPhone) lines.push(`📞 ${escapeHtml(settings.contactPhone)}`);
  if (settings.contactPhoneAlt) lines.push(`📞 ${escapeHtml(settings.contactPhoneAlt)}`);

  const hours = [...new Set(branches.map((row) => String(row.workingHours || "").trim()).filter(Boolean))];
  if (hours.length) {
    lines.push("", "<b>Ish vaqti</b>");
    for (const row of branches) {
      if (!row.workingHours) continue;
      lines.push(`${escapeHtml(row.name)}: ${escapeHtml(row.workingHours)}`);
    }
  } else {
    lines.push("", "Ish vaqti filialga qarab o'zgaradi.");
  }

  const site = publicSiteUrl();
  if (site) lines.push("", `Sayt: ${escapeHtml(site)}`);
  if (settings.footerShort) lines.push("", escapeHtml(settings.footerShort));

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: mainMenuKeyboard() });
}

function registerHelp(bot) {
  bot.hears(BUTTONS.help, handleHelp);
}

module.exports = { registerHelp, handleHelp };
