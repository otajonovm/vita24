const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { dataPath } = require("./dataDir");

const PRESCRIPTION_DIR = dataPath("private", "prescriptions");
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};

fs.mkdirSync(PRESCRIPTION_DIR, { recursive: true });

function extensionFor(mime) {
  return ALLOWED[mime] || null;
}

function assertPrescriptionFile({ mimetype, size }) {
  if (!extensionFor(mimetype)) {
    const error = new Error("Faqat JPG, PNG yoki PDF yuklash mumkin");
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
  return /^rx\/[a-zA-Z0-9_-]+\.(jpg|png|pdf)$/.test(String(value || ""));
}

function absolutePath(storageKey) {
  if (!isStorageKey(storageKey)) return null;
  const fileName = path.basename(storageKey);
  const full = path.join(PRESCRIPTION_DIR, fileName);
  if (!full.startsWith(PRESCRIPTION_DIR)) return null;
  return full;
}

function savePrescriptionBuffer({ buffer, mimetype, userId }) {
  assertPrescriptionFile({ mimetype, size: buffer.length });
  const ext = extensionFor(mimetype);
  const id = crypto.randomUUID();
  const owner = String(userId || "");
  const key = /^[a-zA-Z0-9_-]+$/.test(owner) ? `rx/${owner}__${id}${ext}` : `rx/${id}${ext}`;
  fs.writeFileSync(absolutePath(key), buffer);
  return key;
}

function prescriptionKeyOwner(storageKey) {
  if (!isStorageKey(storageKey)) return null;
  const base = path.basename(String(storageKey)).replace(/\.(jpg|png|pdf)$/i, "");
  const mark = base.lastIndexOf("__");
  if (mark <= 0) return null;
  const owner = base.slice(0, mark);
  const id = base.slice(mark + 2);
  if (!/^[a-zA-Z0-9_-]+$/.test(owner)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  return owner;
}

function ownsPrescriptionKey(storageKey, userId) {
  const owner = prescriptionKeyOwner(storageKey);
  return Boolean(owner) && owner === String(userId || "") && Boolean(readPrescriptionFile(storageKey));
}

function readPrescriptionFile(storageKey) {
  const full = absolutePath(storageKey);
  if (!full || !fs.existsSync(full)) return null;
  return { path: full, mime: mimeForKey(storageKey) };
}

function mimeForKey(storageKey) {
  if (String(storageKey).endsWith(".png")) return "image/png";
  if (String(storageKey).endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

function signPrescriptionAccess(prescriptionId, ttlMs = 10 * 60 * 1000) {
  const exp = Date.now() + ttlMs;
  const sig = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${prescriptionId}.${exp}`)
    .digest("base64url");
  return {
    exp,
    sig,
    url: `/api/prescriptions/${prescriptionId}/file?exp=${exp}&sig=${sig}`,
  };
}

function verifyPrescriptionSignature(prescriptionId, exp, sig) {
  const expires = Number(exp);
  if (!sig || !Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${prescriptionId}.${expires}`)
    .digest("base64url");
  if (expected.length !== String(sig).length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sig)));
}

module.exports = {
  PRESCRIPTION_DIR,
  MAX_BYTES,
  ALLOWED,
  extensionFor,
  assertPrescriptionFile,
  isStorageKey,
  absolutePath,
  savePrescriptionBuffer,
  prescriptionKeyOwner,
  ownsPrescriptionKey,
  readPrescriptionFile,
  signPrescriptionAccess,
  verifyPrescriptionSignature,
};
