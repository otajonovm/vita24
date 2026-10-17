const prisma = require("./prisma");
const { AppError } = require("./response");
const { encryptSecret, decryptSecret } = require("./secrets");
const { DELIVERY_FEE, FREE_DELIVERY_FROM } = require("./deliveryFee.json");

const CACHE_MS = 15_000;
const TEMPLATE_KEYS = ["otp", "askContact", "PAID", "PREPARING", "READY", "DELIVERING", "COMPLETED", "CANCELLED", "WAITING_PAYMENT"];

const DEFAULT_TEMPLATES = {
  otp: "Vita24 tasdiqlash kodi: {{code}}\nTelefon: {{phone}}\nSaytga qaytib shu kodni kiriting. Kod 5 daqiqa amal qiladi.",
  askContact: "Kodni olish uchun Telegramdagi telefon raqamingizni yuboring. Kod shu chatga keladi, keyin saytga qaytib kiriting.",
  PAID: "To'lovingiz qabul qilindi",
  PREPARING: "Buyurtmangiz yig'ilmoqda",
  READY: "Buyurtmangiz tayyor",
  DELIVERING: "Buyurtmangiz yo'lda",
  COMPLETED: "Buyurtmangiz yetkazildi",
  CANCELLED: "Buyurtmangiz bekor qilindi",
  WAITING_PAYMENT: "Retsept tasdiqlandi, to'lovni amalga oshiring",
};

const DEFAULTS = {
  deliveryFee: DELIVERY_FEE,
  freeDeliveryFrom: FREE_DELIVERY_FROM,
  reviewWindowMinutes: 120,
  paymentWindowMinutes: 15,
  paymeEnabled: true,
  clickEnabled: true,
  cashEnabled: true,
  pickupEnabled: true,
  contactPhone: "1095",
  contactPhoneAlt: "+998 71 200 24 24",
  footerAbout: "Ko'p filialli onlayn dorixona. 24/7 buyurtma va farmatsevt nazorati.",
  footerLicensed: "Litsenziyalangan dorixona tarmog'i",
  footerShort: "24/7 onlayn dorixona. Filial tanlang, zaxira qiling, farmatsevt tasdig'idan so'ng to'lang.",
  messageTemplates: DEFAULT_TEMPLATES,
};

let cached = null;
let cachedAt = 0;

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function renderTemplate(template, vars = {}) {
  return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => (vars[key] == null ? "" : String(vars[key])));
}

function templatesFrom(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(TEMPLATE_KEYS.map((key) => [key, String(source[key] || DEFAULT_TEMPLATES[key])]));
}

function maskToken(plain) {
  const value = String(plain || "").trim();
  if (!value) return { hasTelegramToken: false, telegramTokenLast4: null };
  return { hasTelegramToken: true, telegramTokenLast4: value.slice(-4) };
}

function normalize(row, tokenPlain) {
  const templates = templatesFrom(row?.messageTemplates);
  return {
    deliveryFee: money(row?.deliveryFee ?? DEFAULTS.deliveryFee),
    freeDeliveryFrom: money(row?.freeDeliveryFrom ?? DEFAULTS.freeDeliveryFrom),
    reviewWindowMinutes: Number(row?.reviewWindowMinutes || DEFAULTS.reviewWindowMinutes),
    paymentWindowMinutes: Number(row?.paymentWindowMinutes || DEFAULTS.paymentWindowMinutes),
    paymeEnabled: row?.paymeEnabled !== false,
    clickEnabled: row?.clickEnabled !== false,
    cashEnabled: row?.cashEnabled !== false,
    pickupEnabled: row?.pickupEnabled !== false,
    contactPhone: row?.contactPhone || DEFAULTS.contactPhone,
    contactPhoneAlt: row?.contactPhoneAlt || DEFAULTS.contactPhoneAlt,
    footerAbout: row?.footerAbout || DEFAULTS.footerAbout,
    footerLicensed: row?.footerLicensed || DEFAULTS.footerLicensed,
    footerShort: row?.footerShort || DEFAULTS.footerShort,
    messageTemplates: templates,
    telegramToken: tokenPlain || "",
  };
}

function remember(value) {
  cached = value;
  cachedAt = Date.now();
  return value;
}

function peekShopSettings() {
  return cached;
}

async function getShopSettings() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    const row = await prisma.shopSetting.findUnique({ where: { id: "default" } });
    const stored = row?.telegramBotToken ? decryptSecret(row.telegramBotToken) : "";
    return remember(normalize(row, stored));
  } catch {
    return remember(normalize(null, ""));
  }
}

function publicShopSettings(settings) {
  const { telegramToken, ...rest } = settings;
  const telegramBotUsername = require("./telegramBot").currentBotUsername();
  return {
    ...rest,
    telegramBotUsername,
    telegramBotUrl: telegramBotUsername ? `https://t.me/${telegramBotUsername}` : "",
  };
}

function adminShopSettings(settings) {
  const mask = maskToken(settings.telegramToken);
  const envToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  return {
    ...publicShopSettings(settings),
    ...mask,
    telegramFromEnv: !mask.hasTelegramToken && Boolean(envToken),
  };
}

function checkoutRulesFrom(settings) {
  return {
    deliveryFee: settings.deliveryFee,
    freeDeliveryFrom: settings.freeDeliveryFrom,
    reviewWindowMinutes: settings.reviewWindowMinutes,
    paymentWindowMinutes: settings.paymentWindowMinutes,
  };
}

function windowMinutes(kind, rules) {
  const snapshot = Number(kind === "review" ? rules?.reviewWindowMinutes : rules?.paymentWindowMinutes);
  if (snapshot > 0) return snapshot;
  const live = peekShopSettings();
  const fromLive = Number(kind === "review" ? live?.reviewWindowMinutes : live?.paymentWindowMinutes);
  if (fromLive > 0) return fromLive;
  return kind === "review" ? 120 : 15;
}

function assertPaymentAllowed(settings, method, deliveryType) {
  const provider = String(method || "CASH").toUpperCase();
  if (deliveryType === "PICKUP" && !settings.pickupEnabled) {
    throw new AppError("Olib ketish hozir o'chiq", 409, "PICKUP_DISABLED");
  }
  if (provider === "PAYME" && !settings.paymeEnabled) {
    throw new AppError("Payme hozir o'chiq", 409, "PAYMENT_DISABLED");
  }
  if (provider === "CLICK" && !settings.clickEnabled) {
    throw new AppError("Click hozir o'chiq", 409, "PAYMENT_DISABLED");
  }
  if (provider === "CASH" && !settings.cashEnabled) {
    throw new AppError("Naqd to'lov hozir o'chiq", 409, "PAYMENT_DISABLED");
  }
  if (!settings.paymeEnabled && !settings.clickEnabled && !settings.cashEnabled) {
    throw new AppError("Hech qanday to'lov yoqilmagan", 409, "PAYMENT_DISABLED");
  }
}

async function saveShopSettings(body) {
  const current = await getShopSettings();
  const templates = templatesFrom({ ...current.messageTemplates, ...(body.messageTemplates || {}) });
  let telegramBotToken;
  if (body.telegramBotToken) {
    telegramBotToken = encryptSecret(String(body.telegramBotToken).trim());
  }
  const saved = await prisma.shopSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      deliveryFee: money(body.deliveryFee),
      freeDeliveryFrom: money(body.freeDeliveryFrom),
      reviewWindowMinutes: body.reviewWindowMinutes,
      paymentWindowMinutes: body.paymentWindowMinutes,
      paymeEnabled: body.paymeEnabled,
      clickEnabled: body.clickEnabled,
      cashEnabled: body.cashEnabled,
      pickupEnabled: body.pickupEnabled,
      contactPhone: body.contactPhone,
      contactPhoneAlt: body.contactPhoneAlt || "",
      footerAbout: body.footerAbout,
      footerLicensed: body.footerLicensed,
      footerShort: body.footerShort,
      messageTemplates: templates,
      ...(telegramBotToken ? { telegramBotToken } : {}),
    },
    update: {
      deliveryFee: money(body.deliveryFee),
      freeDeliveryFrom: money(body.freeDeliveryFrom),
      reviewWindowMinutes: body.reviewWindowMinutes,
      paymentWindowMinutes: body.paymentWindowMinutes,
      paymeEnabled: body.paymeEnabled,
      clickEnabled: body.clickEnabled,
      cashEnabled: body.cashEnabled,
      pickupEnabled: body.pickupEnabled,
      contactPhone: body.contactPhone,
      contactPhoneAlt: body.contactPhoneAlt || "",
      footerAbout: body.footerAbout,
      footerLicensed: body.footerLicensed,
      footerShort: body.footerShort,
      messageTemplates: templates,
      ...(telegramBotToken ? { telegramBotToken } : {}),
    },
  });
  const plain = telegramBotToken ? String(body.telegramBotToken).trim() : current.telegramToken;
  return remember(normalize(saved, plain));
}

module.exports = {
  DEFAULT_TEMPLATES,
  TEMPLATE_KEYS,
  renderTemplate,
  peekShopSettings,
  getShopSettings,
  publicShopSettings,
  adminShopSettings,
  checkoutRulesFrom,
  windowMinutes,
  assertPaymentAllowed,
  saveShopSettings,
};
