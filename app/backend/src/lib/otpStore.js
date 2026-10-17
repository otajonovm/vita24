const crypto = require("crypto");

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const challenges = new Map();

function hashCode(phone, code) {
  return crypto.createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function purge(phone) {
  const current = challenges.get(phone);
  if (current && current.expiresAt <= Date.now()) {
    challenges.delete(phone);
  }
}

function issueOtp(phone) {
  purge(phone);
  const code = String(crypto.randomInt(100000, 1000000));
  challenges.set(phone, {
    hash: hashCode(phone, code),
    expiresAt: Date.now() + TTL_MS,
    attempts: 0,
  });

  const payload = { code, expiresInSec: Math.floor(TTL_MS / 1000) };
  if (String(process.env.ENABLE_DEV_OTP || "").toLowerCase() === "true") {
    payload.devCode = code;
  }
  return payload;
}

function dropOtp(phone) {
  challenges.delete(phone);
}

function verifyOtp(phone, code) {
  purge(phone);
  const current = challenges.get(phone);
  if (!current) {
    return { ok: false, reason: "Kod muddati tugagan yoki so'ralmagan" };
  }

  current.attempts += 1;
  if (current.attempts > MAX_ATTEMPTS) {
    challenges.delete(phone);
    return { ok: false, reason: "Juda ko'p urinish. Yangi kod so'rang" };
  }

  const given = hashCode(phone, String(code || "").trim());
  const valid =
    given.length === current.hash.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(current.hash));

  if (!valid) {
    return { ok: false, reason: "Tasdiqlash kodi noto'g'ri" };
  }

  challenges.delete(phone);
  return { ok: true };
}

function resetOtpStore() {
  challenges.clear();
}

module.exports = {
  issueOtp,
  verifyOtp,
  dropOtp,
  resetOtpStore,
};
