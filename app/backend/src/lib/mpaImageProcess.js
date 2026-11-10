const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { dataPath } = require("./dataDir");
const { MEDICINE_UPLOAD_URL } = require("../middlewares/upload");

const MEDICINE_UPLOAD_DIR = dataPath("public", "uploads", "medicines");
const MIN_BYTES = 2_000;
const MAX_BYTES = 5 * 1024 * 1024;
const TARGET = 800;

fs.mkdirSync(MEDICINE_UPLOAD_DIR, { recursive: true });

function assertImageBuffer(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MIN_BYTES) {
    throw new Error("Rasm juda kichik yoki bo'sh");
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error("Rasm hajmi juda katta");
  }
  const type = String(contentType || "").toLowerCase();
  if (type && !type.includes("image/") && !type.includes("octet-stream") && !type.includes("jpeg")) {
    throw new Error(`Noto'g'ri content-type: ${type}`);
  }
}

/**
 * Oq chetlarni kesish, 800×800 oq fon, WebP + thumbnail.
 * sharp bo'lmasa asl JPEG saqlanadi (fallback).
 */
async function processAndStoreRegistryImage(medicineId, buffer, contentType) {
  assertImageBuffer(buffer, contentType);
  const id = String(medicineId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "unknown";
  const stamp = Date.now();
  const rand = crypto.randomBytes(3).toString("hex");

  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    sharp = null;
  }

  if (!sharp) {
    const fileName = `med-${id}-mpa-${stamp}-${rand}.jpg`;
    const full = path.join(MEDICINE_UPLOAD_DIR, fileName);
    fs.writeFileSync(full, buffer);
    return {
      imageUrl: `${MEDICINE_UPLOAD_URL}/${fileName}`,
      thumbUrl: null,
      width: null,
      height: null,
    };
  }

  const image = sharp(buffer, { failOn: "none" }).rotate();
  const trimmed = await image.trim({ threshold: 12 }).toBuffer({ resolveWithObject: true }).catch(async () => {
    const meta = await sharp(buffer, { failOn: "none" }).rotate().toBuffer({ resolveWithObject: true });
    return meta;
  });

  const resized = await sharp(trimmed.data)
    .resize(TARGET, TARGET, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .webp({ quality: 82 })
    .toBuffer();

  const thumb = await sharp(resized)
    .resize(200, 200, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .webp({ quality: 75 })
    .toBuffer();

  const fileName = `med-${id}-mpa-${stamp}-${rand}.webp`;
  const thumbName = `med-${id}-mpa-${stamp}-${rand}-thumb.webp`;
  fs.writeFileSync(path.join(MEDICINE_UPLOAD_DIR, fileName), resized);
  fs.writeFileSync(path.join(MEDICINE_UPLOAD_DIR, thumbName), thumb);

  return {
    imageUrl: `${MEDICINE_UPLOAD_URL}/${fileName}`,
    thumbUrl: `${MEDICINE_UPLOAD_URL}/${thumbName}`,
    width: TARGET,
    height: TARGET,
  };
}

function pickPreferredImage(imgUrls) {
  const list = Array.isArray(imgUrls) ? imgUrls : [];
  if (!list.length) return null;
  const front = list.find((item) => String(item.side || "").toUpperCase() === "FRONT_SIDE");
  return front || list[0];
}

module.exports = {
  processAndStoreRegistryImage,
  pickPreferredImage,
  assertImageBuffer,
  MEDICINE_UPLOAD_DIR,
};
