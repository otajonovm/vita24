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

function displayName(raw) {
  const name = String(raw || "").trim();
  if (!name || name === "Mijoz") return "";
  return name;
}

function serializeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    branchId: user.branchId || null,
    notifyOrders: user.notifyOrders !== false,
    status: user.status || "ACTIVE",
    blockReason: user.blockReason || null,
    createdAt: user.createdAt,
    lastStreet: user.lastStreet || "",
    lastApartment: user.lastApartment || "",
    lastFloor: user.lastFloor || "",
    lastIntercom: user.lastIntercom || "",
    lastLat: user.lastLat ?? null,
    lastLng: user.lastLng ?? null,
  };
}

function guestPasswordHash() {
  return `guest:${crypto.randomBytes(32).toString("hex")}`;
}

const userProfileSelect = {
  id: true,
  name: true,
  phone: true,
  role: true,
  branchId: true,
  createdAt: true,
  lastStreet: true,
  lastApartment: true,
  lastFloor: true,
  lastIntercom: true,
  lastLat: true,
  lastLng: true,
  notifyOrders: true,
  status: true,
  blockReason: true,
};

async function provisionCustomer(tx, { phone, fullName }) {
  const normalizedPhone = normalizePhone(phone);
  const name = String(fullName || "").trim();

  if (!name) {
    throw new AppError("Ism majburiy", 400, "VALIDATION_ERROR");
  }

  let user = await tx.user.findUnique({
    where: { phone: normalizedPhone },
    select: userProfileSelect,
  });

  if (!user) {
    user = await tx.user.create({
      data: {
        name,
        phone: normalizedPhone,
        passwordHash: guestPasswordHash(),
        role: "CUSTOMER",
      },
      select: userProfileSelect,
    });

    return { user, created: true };
  }

  return { user, created: false };
}

module.exports = {
  normalizePhone,
  displayName,
  serializeUser,
  provisionCustomer,
  userProfileSelect,
};
