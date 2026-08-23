const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { normalizePhone, serializeUser } = require("../lib/userProvisioning");

function addressPayload(user) {
  return {
    street: user.lastStreet || "",
    apartment: user.lastApartment || "",
    floor: user.lastFloor || "",
    intercom: user.lastIntercom || "",
    lat: user.lastLat ?? null,
    lng: user.lastLng ?? null,
    fullName: user.name || "",
    phone: user.phone,
  };
}

const getAddress = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.lastStreet) {
    return sendSuccess(res, null, "Saqlangan manzil yo'q");
  }
  return sendSuccess(res, addressPayload(user), "Saqlangan manzil");
});

const saveAddress = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const phone = normalizePhone(body.phone);
  const street = String(body.street || "").trim();
  if (!street) {
    throw new AppError("Ko'cha manzili majburiy", 400, "VALIDATION_ERROR");
  }

  const lat = body.lat == null || body.lat === "" ? null : Number(body.lat);
  const lng = body.lng == null || body.lng === "" ? null : Number(body.lng);

  const data = {
    lastStreet: street,
    lastApartment: String(body.apartment || "").trim() || null,
    lastFloor: String(body.floor || "").trim() || null,
    lastIntercom: String(body.intercom || "").trim() || null,
    lastLat: Number.isFinite(lat) ? lat : null,
    lastLng: Number.isFinite(lng) ? lng : null,
  };

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (!existing) {
    return sendSuccess(res, { ...data, phone, saved: false }, "Buyurtmadan keyin saqlanadi");
  }

  if (body.fullName && String(body.fullName).trim()) {
    data.name = String(body.fullName).trim();
  }

  const user = await prisma.user.update({
    where: { phone },
    data,
  });

  return sendSuccess(res, { ...addressPayload(user), user: serializeUser(user) }, "Manzil saqlandi");
});

module.exports = { getAddress, saveAddress };
