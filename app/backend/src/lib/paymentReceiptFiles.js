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

function detectMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  if (buffer.slice(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  // HEIC/HEIF: ftyp....heic/heif/mif1
  if (buffer.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.slice(8, 12).toString("ascii").toLowerCase();
    if (["heic", "heif", "mif1", "msf1", "hevx", "hevc"].some((token) => brand.includes(token.slice(0, 4)))) {
      return "image/heic";
    }
    const major = buffer.slice(8, 16).toString("ascii").toLowerCase();
    if (/heic|heif|mif1|msf1/.test(major)) return "image/heic";
  }
  return null;
}

function assertReceiptFile({ mimetype, size, buffer }) {
  const detected = buffer ? detectMimeFromBuffer(buffer) : null;
  const mime = detected || mimetype;
  if (!detected) {
    const error = new Error("Fayl turi aniqlanmadi. Faqat JPG, PNG, WEBP, HEIC yoki PDF yuklash mumkin");
    error.statusCode = 400;
    error.code = "INVALID_FILE_TYPE";
    throw error;
  }
  if (!extensionFor(mime)) {
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
  return mime;
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
  const mime = assertReceiptFile({ mimetype, size: buffer.length, buffer });
  const ext = extensionFor(mime);
  const id = crypto.randomUUID();
  const owner = String(userId || "");
  const key = /^[a-zA-Z0-9_-]+$/.test(owner) ? `pay/${owner}__${id}${ext}` : `pay/${id}${ext}`;
  fs.writeFileSync(absolutePath(key), buffer);
  return key;
}

function deleteReceiptFile(storageKey) {
  const full = absolutePath(storageKey);
  if (!full) return false;
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
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
  detectMimeFromBuffer,
  assertReceiptFile,
  isStorageKey,
  absolutePath,
  saveReceiptBuffer,
  deleteReceiptFile,
  receiptKeyOwner,
  ownsReceiptKey,
  readReceiptFile,
  signReceiptAccess,
  verifyReceiptSignature,
};
