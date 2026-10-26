const { Bot, GrammyError, HttpError } = require("grammy");
const { autoRetry } = require("@grammyjs/auto-retry");
const { customerBlockMessage } = require("../lib/customerAccess");
const { getToken } = require("./token");
const { setBotUsername, webAppUrl } = require("./identity");
const { mainMenuKeyboard, BUTTONS } = require("./keyboards");
const { findUserByChatId } = require("./linkUser");
const { clearSearchMode } = require("./pending");
const { migrateTelegramOtpFile } = require("./migrateLinks");
const { registerStart } = require("./handlers/start");
const { registerContact } = require("./handlers/contact");
const { registerSearch } = require("./handlers/search");
const { registerLocation } = require("./handlers/location");
const { registerOrders } = require("./handlers/orders");
const { registerHelp } = require("./handlers/help");

let bot = null;
let startedToken = "";
let startQueue = Promise.resolve();
let stopping = false;
let missingTokenLogged = false;

async function errorBoundary(ctx, next) {
  try {
    await next();
  } catch (error) {
    console.error("[telegram] handler:", error.message || error);
    try {
      await ctx.reply("Vaqtincha xatolik. Keyinroq urinib ko'ring.");
    } catch {
      // javob yuborilmasa ham polling davom etsin
    }
  }
}

async function privateOnly(ctx, next) {
  if (ctx.chat && ctx.chat.type !== "private") return;
  await next();
}

async function blockedUsers(ctx, next) {
  try {
    const user = await findUserByChatId(ctx.from?.id);
    if (user && !user.deletedAt && user.status === "SUSPENDED") {
      await ctx.reply(customerBlockMessage(user.blockReason));
      return;
    }
  } catch (error) {
    console.error("[telegram] user check:", error.message);
  }
  await next();
}

async function handleBack(ctx) {
  clearSearchMode(ctx.from.id);
  await ctx.reply("Asosiy menyu", { reply_markup: mainMenuKeyboard() });
}

async function unknownMessage(ctx) {
  if (ctx.message?.contact || ctx.message?.location) return;
  await ctx.reply("Menyudan tanlang", { reply_markup: mainMenuKeyboard() });
}

function attachCatch(instance) {
  instance.catch((err) => {
    const error = err.error;
    if (error instanceof GrammyError) {
      console.error("[telegram] GrammyError:", error.description, error.error_code);
      if (error.error_code === 409) {
        console.error("[telegram] Bitta token uchun faqat bitta polling ishlashi kerak.");
      }
    } else if (error instanceof HttpError) {
      console.error("[telegram] HttpError:", error.message);
    } else {
      console.error("[telegram]", error);
    }
  });
}

async function configureMenuButton(instance) {
  const url = webAppUrl();
  try {
    if (url) {
      await instance.api.setChatMenuButton({
        menu_button: { type: "web_app", text: "Dorixona", web_app: { url } },
      });
    } else {
      await instance.api.setChatMenuButton({ menu_button: { type: "default" } });
    }
  } catch (error) {
    console.error("[telegram] menu button:", error.message);
  }
}

function createBot(token) {
  const instance = new Bot(token);
  instance.api.config.use(autoRetry());
  attachCatch(instance);
  instance.use(errorBoundary);
  instance.use(privateOnly);
  instance.use(blockedUsers);
  registerStart(instance);
  registerContact(instance);
  registerSearch(instance);
  registerLocation(instance);
  registerOrders(instance);
  registerHelp(instance);
  instance.hears(BUTTONS.back, handleBack);
  instance.on("message", unknownMessage);
  return instance;
}

async function stopBot() {
  const current = bot;
  bot = null;
  startedToken = "";
  if (!current) return;
  try {
    await current.stop();
  } catch (error) {
    console.error("[telegram] stop:", error.message);
  }
}

async function initBotUnlocked() {
  if (process.env.NODE_ENV === "test") return;
  const token = getToken();
  if (!token) {
    const wasRunning = Boolean(bot);
    if (bot) await stopBot();
    if (wasRunning) {
      console.log("[telegram] Token olib tashlandi.");
    } else if (!missingTokenLogged) {
      console.log("[telegram] Token topilmadi. OTP hozircha sahifada qoladi.");
      missingTokenLogged = true;
    }
    return;
  }
  missingTokenLogged = false;
  if (bot && startedToken === token) return;

  await stopBot();
  try {
    await migrateTelegramOtpFile();
  } catch (error) {
    console.error("[telegram] chatId migratsiyasi:", error.message);
  }

  const instance = createBot(token);
  bot = instance;
  startedToken = token;
  stopping = false;

  instance
    .start({
      onStart: async (me) => {
        setBotUsername(me?.username || "");
        await configureMenuButton(instance);
        console.log(`[telegram] Bot tayyor${me?.username ? `: @${me.username}` : ""}`);
      },
    })
    .catch((error) => {
      if (stopping) return;
      console.error("[telegram] polling:", error.message || error);
    });
}

function initBot() {
  startQueue = startQueue
    .then(initBotUnlocked)
    .catch((error) => {
      console.error("[telegram] Bot ishga tushmadi:", error.message);
    });
  return startQueue;
}

function syncBot() {
  return initBot();
}

function getBot() {
  return bot;
}

function markStopping() {
  stopping = true;
}

module.exports = {
  getToken,
  createBot,
  initBot,
  stopBot,
  syncBot,
  getBot,
  markStopping,
};
