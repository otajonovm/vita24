const services = require("../bot/services");
const { initBot, stopBot, syncBot } = require("../bot");

module.exports = {
  deliverOtp: services.deliverOtp,
  notifyCustomer: services.notifyCustomer,
  botUrl: services.botUrl,
  currentBotUsername: services.currentBotUsername,
  startTelegramBot: () => {
    initBot().catch((error) => console.error("[telegram]", error.message));
  },
  stopBot,
  syncBot,
};
