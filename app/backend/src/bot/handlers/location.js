const { BUTTONS, locationKeyboard, mainMenuKeyboard } = require("../keyboards");
const { clearSearchMode } = require("../pending");
const { escapeHtml, nearestBranches } = require("../utils");

async function askLocation(ctx) {
  clearSearchMode(ctx.from.id);
  await ctx.reply("Joylashuvingizni yuboring — eng yaqin filialni topamiz.", {
    reply_markup: locationKeyboard(),
  });
}

async function handleLocation(ctx) {
  const loc = ctx.message?.location;
  if (!loc) return;
  const prisma = require("../../lib/prisma");
  const branches = await prisma.branch.findMany({
    where: { isActive: true, lat: { not: null }, lng: { not: null } },
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      lat: true,
      lng: true,
      isActive: true,
      workingHours: true,
    },
  });
  const nearest = nearestBranches({ lat: loc.latitude, lng: loc.longitude }, branches, 3);
  if (!nearest.length) {
    await ctx.reply("Hozircha koordinatasi bor faol filial yo'q. Saytdan filial tanlang.", {
      reply_markup: mainMenuKeyboard(),
    });
    return;
  }

  const lines = nearest.map((branch, index) => {
    const km = branch.distanceKm.toFixed(1);
    return [
      `${index + 1}. <b>${escapeHtml(branch.name)}</b> — ${escapeHtml(km)} km`,
      escapeHtml(branch.address || ""),
      branch.phone ? escapeHtml(branch.phone) : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  await ctx.reply(lines.join("\n\n"), { parse_mode: "HTML", reply_markup: mainMenuKeyboard() });

  const top = nearest[0];
  await ctx.replyWithVenue(top.lat, top.lng, top.name, top.address || top.name);
}

function registerLocation(bot) {
  bot.hears(BUTTONS.nearest, askLocation);
  bot.on("message:location", handleLocation);
}

module.exports = { registerLocation, askLocation, handleLocation };
