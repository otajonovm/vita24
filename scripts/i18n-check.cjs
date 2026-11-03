const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "app", "frontend", "src");
const localeDir = path.join(root, "i18n", "locales");
const locales = ["uz", "uz-Cyrl", "ru"];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "locales") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
}

walk(root);

const keyRe = /\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]/g;
const keys = new Set();
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(keyRe)) keys.add(match[1]);
}

function lookup(tree, key) {
  if (tree && Object.prototype.hasOwnProperty.call(tree, key) && typeof tree[key] === "string") {
    return tree[key];
  }
  const parts = key.split(".");
  let cursor = tree;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return typeof cursor === "string" ? cursor : undefined;
}

const missing = [];
for (const locale of locales) {
  const tree = JSON.parse(fs.readFileSync(path.join(localeDir, `${locale}.json`), "utf8"));
  for (const key of [...keys].sort()) {
    const value = lookup(tree, key);
    if (typeof value !== "string") missing.push(`${locale}: ${key}`);
  }
}

if (missing.length) {
  console.error(`i18n: ${missing.length} ta kalit yetishmaydi yoki matn emas`);
  for (const line of missing.slice(0, 80)) console.error(`  ${line}`);
  if (missing.length > 80) console.error(`  ... yana ${missing.length - 80} ta`);
  process.exit(1);
}

console.log(`i18n: ${keys.size} ta kalit, ${locales.length} ta tilda bor`);
