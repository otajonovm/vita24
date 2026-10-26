const crypto = require("crypto");

const MAX_AGE_SEC = 24 * 60 * 60;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyTelegramInitData(initData, botToken, options = {}) {
  const raw = String(initData || "").trim();
  const token = String(botToken || "").trim();
  if (!raw || !token) return { ok: false, code: "INVALID" };

  let params;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return { ok: false, code: "INVALID" };
  }

  const hash = String(params.get("hash") || "");
  if (!hash) return { ok: false, code: "INVALID" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const digest = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqual(digest, hash)) return { ok: false, code: "INVALID" };

  const now = Number(options.now) || Date.now();
  const maxAgeMs = (Number(options.maxAgeSec) || MAX_AGE_SEC) * 1000;
  const authDateSec = Number(params.get("auth_date") || 0);
  if (!Number.isFinite(authDateSec) || authDateSec <= 0) return { ok: false, code: "INVALID" };
  const authDateMs = authDateSec * 1000;
  if (authDateMs > now + 60 * 1000) return { ok: false, code: "INVALID" };
  if (now - authDateMs > maxAgeMs) return { ok: false, code: "EXPIRED" };

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    user = null;
  }
  if (!user || user.id == null) return { ok: false, code: "INVALID" };

  return { ok: true, user, authDate: authDateMs };
}

module.exports = {
  MAX_AGE_SEC,
  verifyTelegramInitData,
};
