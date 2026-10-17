const { clientIp } = require("./rateLimit");

const SECRET_KEY = /^(password|passwordHash|currentPassword|newPassword|telegramBotToken|telegramToken|lekkoApiKey|apiKey|totpSecret|totpSecretEnc|secret)$/i;

function isSecretKey(key) {
  return SECRET_KEY.test(key) || /password|secret|apiKey/i.test(key);
}

function sanitizeAudit(value, depth = 0) {
  if (value == null || depth > 5) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && typeof value.toNumber === "function") return Number(value);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeAudit(item, depth + 1));
  if (typeof value === "string") {
    if (value.startsWith("enc:v1:") || /^\$2[aby]\$/.test(value)) return "[yashirilgan]";
    return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  }
  if (typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    if (isSecretKey(key)) {
      out[key] = item ? "[yashirilgan]" : null;
      continue;
    }
    out[key] = sanitizeAudit(item, depth + 1);
  }
  return out;
}

function auditActor(req, user) {
  const person = user || req?.user || {};
  return {
    userId: person.id || null,
    actorId: person.id || null,
    actorName: person.name || null,
    role: person.role || null,
    ip: req ? String(clientIp(req)).slice(0, 64) : null,
    userAgent: req ? String(req.headers?.["user-agent"] || "").slice(0, 300) : null,
  };
}

async function writeAudit(tx, entry) {
  const actor = entry.req ? auditActor(entry.req, entry.user) : {};
  const userId = entry.userId || entry.actorId || actor.userId || null;
  await tx.auditLog.create({
    data: {
      userId,
      actorId: entry.actorId || actor.actorId || userId,
      actorName: entry.actorName || actor.actorName || null,
      role: entry.role || actor.role || null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: String(entry.entityId),
      branchId: entry.branchId || null,
      summary: String(entry.summary || "").slice(0, 500),
      ...(entry.before !== undefined ? { before: sanitizeAudit(entry.before) } : {}),
      ...(entry.after !== undefined ? { after: sanitizeAudit(entry.after) } : {}),
      ip: entry.ip || actor.ip || null,
      userAgent: entry.userAgent || actor.userAgent || null,
    },
  });
}

module.exports = { writeAudit, auditActor, sanitizeAudit };
