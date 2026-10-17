const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", "src", "lib", "deliveryFee.json");
const source = path.join(__dirname, "..", "..", "shared", "deliveryFee.json");

if (!fs.existsSync(source)) {
  if (!fs.existsSync(target)) {
    console.error("deliveryFee.json topilmadi");
    process.exit(1);
  }
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
