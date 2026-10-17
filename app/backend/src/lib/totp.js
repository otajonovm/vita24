const crypto = require("crypto");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(text) {
  const clean = String(text || "").toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("TOTP kaliti yaroqsiz");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret, counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 1000000).padStart(6, "0");
}

function totpCode(secret, time = Date.now(), stepSec = 30) {
  const counter = Math.floor(time / 1000 / stepSec);
  return hotp(secret, counter);
}

function verifyTotp(secret, code, window = 1) {
  const token = String(code || "").trim();
  if (!/^\d{6}$/.test(token) || !secret) return false;
  const now = Date.now();
  for (let shift = -window; shift <= window; shift += 1) {
    if (totpCode(secret, now + shift * 30 * 1000) === token) return true;
  }
  return false;
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function otpauthUrl(secret, account) {
  const label = encodeURIComponent(`Vita24:${account || "admin"}`);
  const issuer = encodeURIComponent("Vita24");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  generateTotpSecret,
  otpauthUrl,
  totpCode,
  verifyTotp,
};
