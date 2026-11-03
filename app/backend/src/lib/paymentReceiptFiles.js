const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { dataPath } = require("./dataDir");

const RECEIPT_DIR = dataPath("private", "payment-receipts");
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heic",
  "application/pdf": ".pdf",
};

fs.mkdirSync(RECEIPT_DIR, { recursive: true });

function extensionFor(mime) {
  return ALLOWED[mime] || null;
}

function assertReceiptFile({ mimetype, size }) {
  if (!extensionFor(mimetype)) {
    const error = new Error("Faqat JPG, PNG, WEBP, HEIC yoki PDF yuklash mumkin");
    error.statusCode = 400;
    error.code = "INVALID_FILE_TYPE";
    throw error;
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    const error = new Error("Fayl 5 MB dan oshmasligi kerak");
    error.statusCode = 400;
    error.code = "FILE_TOO_LARGE";
    throw error;
  }
}

function isStorageKey(value) {
  return /^pay\/[a-zA-Z0-9_-]+\.(jpg|png|webp|heic|pdf)$/.test(String(value || ""));
}

function absolutePath(storageKey) {
  if (!isStorageKey(storageKey)) return null;
  const fileName = path.basename(storageKey);
  const full = path.join(RECEIPT_DIR, fileName);
  if (!full.startsWith(RECEIPT_DIR)) return null;
  return full;
}

function saveReceiptBuffer({ buffer, mimetype, userId }) {
  assertReceiptFile({ mimetype, size: buffer.length });
  const ext = extensionFor(mimetype);
  const id = crypto.randomUUID();
  const owner = String(userId || "");
  const key = /^[a-zA-Z0-9_-]+$/.test(owner) ? `pay/${owner}__${id}${ext}` : `pay/${id}${ext}`;
  fs.writeFileSync(absolutePath(key), buffer);
  return key;
}

function receiptKeyOwner(storageKey) {
  if (!isStorageKey(storageKey)) return null;
  const base = path.basename(String(storageKey)).replace(/\.(jpg|png|webp|heic|pdf)$/i, "");
  const mark = base.lastIndexOf("__");
  if (mark <= 0) return null;
  const owner = base.slice(0, mark);
  const id = base.slice(mark + 2);
  if (!/^[a-zA-Z0-9_-]+$/.test(owner)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  return owner;
}

function ownsReceiptKey(storageKey, userId) {
  const owner = receiptKeyOwner(storageKey);
  return Boolean(owner) && owner === String(userId || "") && Boolean(readReceiptFile(storageKey));
}

function readReceiptFile(storageKey) {
  const full = absolutePath(storageKey);
  if (!full || !fs.existsSync(full)) return null;
  return { path: full, mime: mimeForKey(storageKey) };
}

function mimeForKey(storageKey) {
  const value = String(storageKey || "").toLowerCase();
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".heic")) return "image/heic";
  if (value.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

function signReceiptAccess(receiptId, ttlMs = 10 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  const sig = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`receipt.${receiptId}.${exp}`)
    .digest("base64url");
  return {
    exp,
    sig,
    url: `/api/orders/receipts/${receiptId}/file?exp=${exp}&sig=${sig}`,
  };
}

function verifyReceiptSignature(receiptId, exp, sig) {
  const expires = Number(exp);
  if (!sig || !Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`receipt.${receiptId}.${expires}`)
    .digest("base64url");
  if (expected.length !== String(sig).length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sig)));
}

module.exports = {
  RECEIPT_DIR,
  MAX_BYTES,
  ALLOWED,
  extensionFor,
  assertReceiptFile,
  isStorageKey,
  absolutePath,
  saveReceiptBuffer,
  receiptKeyOwner,
  ownsReceiptKey,
  readReceiptFile,
  signReceiptAccess,
  verifyReceiptSignature,
};
