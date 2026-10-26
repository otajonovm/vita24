const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { BACKEND_ROOT, dataPath } = require("../lib/dataDir");
const { normalizeTelegramPhone, isStaffRole } = require("./utils");

function candidatePaths() {
  const paths = [dataPath("private", "telegram-otp.json"), path.join(BACKEND_ROOT, "private", "telegram-otp.json")];
  return [...new Set(paths)];
}

function readPhones(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed?.phones && typeof parsed.phones === "object" ? parsed.phones : {};
  } catch {
    return {};
  }
}

function archiveFile(filePath) {
  const dest = filePath.replace(/\.json$/i, ".migrated.json");
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(filePath);
    else fs.renameSync(filePath, dest);
  } catch (error) {
    console.error("[telegram] otp json arxivlanmadi:", error.message);
  }
}

async function migrateTelegramOtpFile(db = require("../lib/prisma")) {
  const files = candidatePaths().filter((filePath) => fs.existsSync(filePath));
  if (!files.length) return { migrated: 0 };

  let migrated = 0;
  for (const filePath of files) {
    const phones = readPhones(filePath);
    for (const [rawPhone, rawChatId] of Object.entries(phones)) {
      const phone = normalizeTelegramPhone(rawPhone);
      const telegramChatId = String(rawChatId || "").trim();
      if (!phone || !telegramChatId) continue;

      try {
        const taken = await db.user.findUnique({
          where: { telegramChatId },
          select: { id: true, phone: true },
        });
        if (taken) continue;

        const existing = await db.user.findUnique({ where: { phone } });
        if (existing) {
          if (isStaffRole(existing.role) || existing.telegramChatId || existing.deletedAt) continue;
          await db.user.update({ where: { id: existing.id }, data: { telegramChatId } });
          migrated += 1;
          continue;
        }

        await db.user.create({
          data: {
            name: "Mijoz",
            phone,
            telegramChatId,
            passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
            role: "CUSTOMER",
          },
        });
        migrated += 1;
      } catch (error) {
        console.error("[telegram] chatId ko'chirish:", phone, error.message);
      }
    }
    archiveFile(filePath);
  }

  if (migrated) console.log(`[telegram] ${migrated} ta telefon↔chat bog'lanish bazaga ko'chirildi`);
  return { migrated };
}

module.exports = { migrateTelegramOtpFile };
