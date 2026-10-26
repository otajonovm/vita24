const { Keyboard, InlineKeyboard } = require("grammy");
const { webAppUrl, publicSiteUrl } = require("./identity");

const BUTTONS = {
  shop: "🛍 Dorixona",
  search: "🔍 Dori qidirish",
  orders: "📦 Buyurtmalarim",
  nearest: "📍 Eng yaqin dorixona",
  help: "☎️ Aloqa / Yordam",
  sharePhone: "📱 Telefon raqamni yuborish",
  shareLocation: "📍 Joylashuvni yuborish",
  back: "⬅️ Orqaga",
};

const MENU_BUTTONS = new Set([
  BUTTONS.shop,
  BUTTONS.search,
  BUTTONS.orders,
  BUTTONS.nearest,
  BUTTONS.help,
  BUTTONS.sharePhone,
  BUTTONS.shareLocation,
  BUTTONS.back,
]);

function isMenuButtonText(text) {
  return MENU_BUTTONS.has(String(text || ""));
}

function mainMenuKeyboard() {
  const keyboard = new Keyboard();
  const appUrl = webAppUrl();
  if (appUrl) keyboard.webApp(BUTTONS.shop, appUrl).row();
  return keyboard
    .text(BUTTONS.search)
    .text(BUTTONS.orders)
    .row()
    .text(BUTTONS.nearest)
    .text(BUTTONS.help)
    .resized();
}

function requestContactKeyboard() {
  return new Keyboard().requestContact(BUTTONS.sharePhone).resized().oneTime();
}

function locationKeyboard() {
  return new Keyboard().requestLocation(BUTTONS.shareLocation).row().text(BUTTONS.back).resized();
}

function medicineInlineKeyboard(medicine) {
  const keyboard = new InlineKeyboard().text("Filiallar bo'yicha", `br:${medicine.id}`);
  const base = publicSiteUrl();
  if (base && medicine.slug) {
    const url = `${base}/medicine/${encodeURIComponent(medicine.slug)}`;
    if (url.startsWith("https://") && webAppUrl()) keyboard.webApp("Saytda ochish", url);
    else keyboard.url("Saytda ochish", url);
  }
  return keyboard;
}

function orderDetailKeyboard(orderId) {
  const base = publicSiteUrl();
  if (!base || !orderId) return undefined;
  return new InlineKeyboard().url("Batafsil", `${base}/orders/${encodeURIComponent(orderId)}`);
}

module.exports = {
  BUTTONS,
  MENU_BUTTONS,
  isMenuButtonText,
  mainMenuKeyboard,
  requestContactKeyboard,
  locationKeyboard,
  medicineInlineKeyboard,
  orderDetailKeyboard,
};
