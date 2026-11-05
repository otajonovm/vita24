const prisma = require("./prisma");
const { AppError } = require("./response");
const { encryptSecret, decryptSecret } = require("./secrets");
const { DELIVERY_FEE, FREE_DELIVERY_FROM } = require("./deliveryFee.json");
const {
  isMaskedCardNumber,
  isValidCardNumber,
  maskCardNumber,
  normalizeCardNumber,
} = require("./cardTransfer");

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
  cardTerminalEnabled: true,
  cardTransferEnabled: false,
  cardTransferNumber: "",
  cardTransferHolder: "",
  cardTransferBank: "",
  cardTransferTimeoutMin: 30,
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
  const cardNumber = normalizeCardNumber(row?.cardTransferNumber || "");
  const cardHolder = String(row?.cardTransferHolder || "").trim();
  const cardEnabled = Boolean(row?.cardTransferEnabled) && isValidCardNumber(cardNumber) && Boolean(cardHolder);
  return {
    deliveryFee: money(row?.deliveryFee ?? DEFAULTS.deliveryFee),
    freeDeliveryFrom: money(row?.freeDeliveryFrom ?? DEFAULTS.freeDeliveryFrom),
    reviewWindowMinutes: Number(row?.reviewWindowMinutes || DEFAULTS.reviewWindowMinutes),
    paymentWindowMinutes: Number(row?.paymentWindowMinutes || DEFAULTS.paymentWindowMinutes),
    paymeEnabled: row?.paymeEnabled !== false,
    clickEnabled: row?.clickEnabled !== false,
    cashEnabled: row?.cashEnabled !== false,
    cardTerminalEnabled: row?.cardTerminalEnabled !== false,
    cardTransferEnabled: cardEnabled,
    cardTransferNumber: cardNumber,
    cardTransferHolder: cardHolder,
    cardTransferBank: String(row?.cardTransferBank || "").trim(),
    cardTransferTimeoutMin: Math.min(180, Math.max(5, Number(row?.cardTransferTimeoutMin || DEFAULTS.cardTransferTimeoutMin))),
    pickupEnabled: row?.pickupEnabled !== false,
    contactPhone: row?.contactPhone || DEFAULTS.contactPhone,
    contactPhoneAlt: row?.contactPhoneAlt || DEFAULTS.contactPhoneAlt,
    footerAbout: row?.footerAbout || DEFAULTS.footerAbout,
    footerLicensed: row?.footerLicensed || DEFAULTS.footerLicensed,
    footerShort: row?.footerShort || DEFAULTS.footerShort,
    localizedCopy: row?.localizedCopy && typeof row.localizedCopy === "object" ? row.localizedCopy : {},
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
  const {
    telegramToken,
    cardTransferNumber: _cardNumber,
    cardTransferHolder: _cardHolder,
    cardTransferBank: _cardBank,
    cardTransferEnabled: _cardEnabled,
    cardTransferTimeoutMin: _cardTimeout,
    ...rest
  } = settings;
  const telegramBotUsername = require("../bot/identity").currentBotUsername();
  // Global karta faqat fallback bayrog'i; to'liq raqam buyurtma snapshotida
  return {
    ...rest,
    cardTransferEnabled: Boolean(settings.cardTransferEnabled),
    cardTransferTimeoutMin: Number(settings.cardTransferTimeoutMin || DEFAULTS.cardTransferTimeoutMin),
    telegramBotUsername,
    telegramBotUrl: telegramBotUsername ? `https://t.me/${telegramBotUsername}` : "",
  };
}

function adminShopSettings(settings) {
  const mask = maskToken(settings.telegramToken);
  const envToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const number = settings.cardTransferNumber || "";
  return {
    ...publicShopSettings(settings),
    cardTransferEnabled: Boolean(settings.cardTransferEnabled),
    // GET da maskalangan raqam; PATCH da **** qayta yuborilsa eski saqlanadi
    cardTransferNumber: number ? maskCardNumber(number) : "",
    cardTransferHolder: settings.cardTransferHolder || "",
    cardTransferBank: settings.cardTransferBank || "",
    cardTransferTimeoutMin: settings.cardTransferTimeoutMin || 30,
    cardTransferNumberMasked: maskCardNumber(number),
    ...mask,
    telegramFromEnv: !mask.hasTelegramToken && Boolean(envToken),
  };
}

function checkoutRulesFrom(settings, { paymentMethod } = {}) {
  const method = String(paymentMethod || "").toUpperCase();
  return {
    deliveryFee: settings.deliveryFee,
    freeDeliveryFrom: settings.freeDeliveryFrom,
    reviewWindowMinutes: settings.reviewWindowMinutes,
    paymentWindowMinutes:
      method === "CARD_TRANSFER"
        ? Number(settings.cardTransferTimeoutMin || DEFAULTS.cardTransferTimeoutMin)
        : settings.paymentWindowMinutes,
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
  if (provider === "CARD_TERMINAL") {
    if (deliveryType === "PICKUP") {
      throw new AppError("Karta terminal faqat yetkazib berishda", 409, "PAYMENT_DISABLED");
    }
    if (!settings.cardTerminalEnabled) {
      throw new AppError("Karta terminal hozir o'chiq", 409, "PAYMENT_DISABLED");
    }
  }
  if (provider === "CARD_TRANSFER") {
    if (!settings.cardTransferEnabled) {
      throw new AppError("Kartaga o'tkazma hozir o'chiq", 409, "PAYMENT_DISABLED");
    }
    if (!isValidCardNumber(settings.cardTransferNumber) || !String(settings.cardTransferHolder || "").trim()) {
      throw new AppError("Kartaga o'tkazma sozlamalari to'liq emas", 409, "PAYMENT_DISABLED");
    }
  }
  if (
    !settings.paymeEnabled &&
    !settings.clickEnabled &&
    !settings.cashEnabled &&
    !settings.cardTerminalEnabled &&
    !settings.cardTransferEnabled
  ) {
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

  const rawCardInput = body.cardTransferNumber != null ? body.cardTransferNumber : current.cardTransferNumber;
  const keepExistingCard = body.cardTransferNumber != null && isMaskedCardNumber(body.cardTransferNumber);
  const cardNumber = keepExistingCard
    ? normalizeCardNumber(current.cardTransferNumber)
    : normalizeCardNumber(rawCardInput);
  const cardHolder = String(
    body.cardTransferHolder != null ? body.cardTransferHolder : current.cardTransferHolder || ""
  ).trim();
  const cardBank = String(body.cardTransferBank != null ? body.cardTransferBank : current.cardTransferBank || "").trim();
  const cardTimeout = Math.min(
    180,
    Math.max(
      5,
      Number(
        body.cardTransferTimeoutMin != null ? body.cardTransferTimeoutMin : current.cardTransferTimeoutMin || 30
      )
    )
  );
  let cardEnabled = body.cardTransferEnabled != null ? Boolean(body.cardTransferEnabled) : current.cardTransferEnabled;
  if (cardEnabled && (!isValidCardNumber(cardNumber) || !cardHolder)) {
    throw new AppError("Kartaga o'tkazmani yoqish uchun karta raqami va egasi majburiy", 400, "VALIDATION_ERROR");
  }
  if (
    body.cardTransferNumber != null &&
    String(body.cardTransferNumber).trim() &&
    !keepExistingCard &&
    !isValidCardNumber(cardNumber)
  ) {
    throw new AppError("Karta raqami 16 ta raqamdan iborat bo'lishi kerak", 400, "VALIDATION_ERROR");
  }

  const cardFields = {
    cardTransferEnabled: cardEnabled,
    cardTransferNumber: cardNumber,
    cardTransferHolder: cardHolder,
    cardTransferBank: cardBank,
    cardTransferTimeoutMin: cardTimeout,
  };

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
      cardTerminalEnabled: body.cardTerminalEnabled !== false,
      ...cardFields,
      pickupEnabled: body.pickupEnabled,
      contactPhone: body.contactPhone,
      contactPhoneAlt: body.contactPhoneAlt || "",
      footerAbout: body.footerAbout,
      footerLicensed: body.footerLicensed,
      footerShort: body.footerShort,
      localizedCopy: body.localizedCopy && typeof body.localizedCopy === "object" ? body.localizedCopy : {},
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
      cardTerminalEnabled: body.cardTerminalEnabled !== false,
      ...cardFields,
      pickupEnabled: body.pickupEnabled,
      contactPhone: body.contactPhone,
      contactPhoneAlt: body.contactPhoneAlt || "",
      footerAbout: body.footerAbout,
      footerLicensed: body.footerLicensed,
      footerShort: body.footerShort,
      localizedCopy: body.localizedCopy && typeof body.localizedCopy === "object" ? body.localizedCopy : {},
      messageTemplates: templates,
      ...(telegramBotToken ? { telegramBotToken } : {}),
    },
  });
  const plain = telegramBotToken ? String(body.telegramBotToken).trim() : current.telegramToken;
  const next = remember(normalize(saved, plain));
  if (telegramBotToken) {
    queueMicrotask(() => {
      Promise.resolve()
        .then(() => require("../bot").syncBot())
        .catch((error) => console.error("[telegram] qayta ishga tushirish:", error.message));
    });
  }
  return next;
}

module.exports = {
  DEFAULTS,
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
