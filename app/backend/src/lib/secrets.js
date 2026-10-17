const crypto = require("crypto");

const WEAK_MARKERS = ["change-me", "changeme", "secret", "password", "jwt-secret", "your-secret"];

function isWeakSecret(value, minLength = 32) {
  const secret = String(value || "").trim();
  if (secret.length < minLength) return true;
  const lower = secret.toLowerCase();
  return WEAK_MARKERS.some((marker) => lower.includes(marker));
}

function assertStrongSecret(name, value, minLength = 32) {
  if (isWeakSecret(value, minLength)) {
    throw new Error(
      `${name} zaif yoki o'rnatilmagan. Kamida ${minLength} tasodifiy belgi kiriting va "change-me" ishlatmang.`
    );
  }
  return String(value).trim();
}

function envFlag(name) {
  return String(process.env[name] || "").toLowerCase() === "true";
}

function assertRuntimeSecrets() {
  assertStrongSecret("JWT_SECRET", process.env.JWT_SECRET, 32);
  assertStrongSecret("LEKKO_KEY_SECRET", process.env.LEKKO_KEY_SECRET, 32);

  if (process.env.NODE_ENV === "production") {
    if (envFlag("ENABLE_MOCK_PAY")) {
      throw new Error("ENABLE_MOCK_PAY productionda yoqilishi mumkin emas");
    }
    if (envFlag("ENABLE_DEV_OTP")) {
      throw new Error("ENABLE_DEV_OTP productionda yoqilishi mumkin emas");
    }
  }
}

function encryptionKey() {
  const secret = assertStrongSecret("LEKKO_KEY_SECRET", process.env.LEKKO_KEY_SECRET, 32);
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(plain) {
  if (plain == null || String(plain).trim() === "") return null;
  const text = String(plain);
  if (text.startsWith("enc:v1:")) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(stored) {
  if (stored == null || stored === "") return "";
  const text = String(stored);
  if (!text.startsWith("enc:v1:")) return text;

  const payload = text.slice("enc:v1:".length);
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Shifrlangan kalit yaroqsiz");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function maskSecret(stored) {
  if (stored == null || String(stored).trim() === "") {
    return { hasLekkoKey: false, lekkoKeyLast4: null };
  }
  try {
    const plain = String(decryptSecret(stored) || "").trim();
    if (!plain) return { hasLekkoKey: false, lekkoKeyLast4: null };
    return { hasLekkoKey: true, lekkoKeyLast4: plain.slice(-4) };
  } catch {
    return { hasLekkoKey: true, lekkoKeyLast4: null };
  }
}

module.exports = {
  isWeakSecret,
  assertStrongSecret,
  assertRuntimeSecrets,
  encryptSecret,
  decryptSecret,
  maskSecret,
};
