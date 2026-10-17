const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const file = path.join(__dirname, "..", ".env");
let text = fs.readFileSync(file, "utf8");

function current(key) {
  const match = text.match(new RegExp("^" + key + "=(?:\"([^\"]*)\"|(\\S+))", "m"));
  return match ? match[1] || match[2] || "" : "";
}

function set(key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp("^" + key + "=.*$", "m");
  text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

function weak(value) {
  return !value || value.length < 32 || /change-me|changeme|password|jwt-secret/i.test(value);
}

if (weak(current("JWT_SECRET"))) set("JWT_SECRET", crypto.randomBytes(36).toString("hex"));
if (weak(current("LEKKO_KEY_SECRET"))) set("LEKKO_KEY_SECRET", crypto.randomBytes(36).toString("hex"));
if (!current("SEED_ADMIN_PASSWORD")) set("SEED_ADMIN_PASSWORD", "Admin123!");
if (!current("SEED_PHARMACIST_PASSWORD")) set("SEED_PHARMACIST_PASSWORD", "Pharmacist123!");
if (!current("PUBLIC_SITE_URL")) set("PUBLIC_SITE_URL", "http://localhost:5173");

fs.writeFileSync(file, text);
console.log("env-ok");
