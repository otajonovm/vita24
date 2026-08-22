const crypto = require("crypto");
const { AppError } = require("./response");

function normalizePhone(raw) {
  const value = String(raw || "").trim();
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("998") && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.length === 9) {
    return `+998${digits}`;
  }

  throw new AppError(
    "Telefon raqami +998XXXXXXXXX formatida bo'lishi kerak",
    400,
    "VALIDATION_ERROR"
  );
}

function serializeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function guestPasswordHash() {
  return `guest:${crypto.randomBytes(32).toString("hex")}`;
}

async function provisionCustomer(tx, { phone, fullName }) {
  const normalizedPhone = normalizePhone(phone);
  const name = String(fullName || "").trim();

  if (!name) {
    throw new AppError("Ism majburiy", 400, "VALIDATION_ERROR");
  }

  let user = await tx.user.findUnique({
    where: { phone: normalizedPhone },
  });

  if (!user) {
    user = await tx.user.create({
      data: {
        name,
        phone: normalizedPhone,
        passwordHash: guestPasswordHash(),
        role: "CUSTOMER",
      },
    });

    return { user, created: true };
  }

  return { user, created: false };
}

module.exports = {
  normalizePhone,
  serializeUser,
  provisionCustomer,
};
