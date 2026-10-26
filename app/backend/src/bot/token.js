const { peekShopSettings } = require("../lib/shopSettings");

function getToken() {
  const fromSettings = String(peekShopSettings()?.telegramToken || "").trim();
  if (fromSettings) return fromSettings;
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

module.exports = { getToken };
