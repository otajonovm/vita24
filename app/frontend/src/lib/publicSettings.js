import { fetchPublicSettings } from "../services/api";
import { DELIVERY_FEE, FREE_DELIVERY_FROM } from "./pricing";

const FALLBACK = {
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
  footerAbout: "",
  footerLicensed: "",
  footerShort: "",
  telegramBotUsername: "",
  telegramBotUrl: "",
};

const TTL_MS = 15000;
let cached = null;
let cachedAt = 0;
let pending = null;

export function peekPublicSettings() {
  return cached || FALLBACK;
}

export function loadPublicSettings() {
  if (cached && Date.now() - cachedAt < TTL_MS) return Promise.resolve(cached);
  if (!pending) {
    pending = fetchPublicSettings()
      .then((data) => {
        cached = { ...FALLBACK, ...data };
        cachedAt = Date.now();
        return cached;
      })
      .catch(() => FALLBACK)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
