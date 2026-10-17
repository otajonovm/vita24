const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { runDbTransaction } = require("../lib/transaction");
const {
  displayName,
  serializeUser,
  userProfileSelect,
} = require("../lib/userProvisioning");
const { settledTotals } = require("../lib/pricing");
const { getCustomerOrderView } = require("../lib/customerOrderView");

const orderListInclude = {
  branch: { select: { id: true, name: true, district: true, phone: true } },
  items: { include: { medicine: { select: { name: true, slug: true } } } },
  prescription: true,
  payment: true,
};

function normalizeCoordinate(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeAddressEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw new AppError(
      `Qo'shimcha manzil #${index + 1} noto'g'ri formatda`,
      400,
      "VALIDATION_ERROR"
    );
  }

  const street = String(entry.street || entry.lastStreet || "").trim();
  if (!street) {
    throw new AppError(
      `Qo'shimcha manzil #${index + 1} uchun ko'cha majburiy`,
      400,
      "VALIDATION_ERROR"
    );
  }

  return {
    label: String(entry.label || "").trim() || `Manzil ${index + 1}`,
    street,
    apartment: String(entry.apartment || "").trim(),
    floor: String(entry.floor || "").trim(),
    intercom: String(entry.intercom || "").trim(),
    lat: normalizeCoordinate(entry.lat ?? entry.lastLat),
    lng: normalizeCoordinate(entry.lng ?? entry.lastLng),
  };
}

function primaryAddress(user) {
  return {
    lastStreet: user.lastStreet || "",
    lastApartment: user.lastApartment || "",
    lastFloor: user.lastFloor || "",
    lastIntercom: user.lastIntercom || "",
    lastLat: user.lastLat ?? null,
    lastLng: user.lastLng ?? null,
  };
}

function addressPayload(user) {
  return {
    street: user.lastStreet || "",
    apartment: user.lastApartment || "",
    floor: user.lastFloor || "",
    intercom: user.lastIntercom || "",
    lat: user.lastLat ?? null,
    lng: user.lastLng ?? null,
    fullName: displayName(user.name),
    phone: user.phone,
  };
}

function buildAdditionalAddressesFromOrders(orders, user) {
  const seen = new Set();
  const primaryKey = [
    user.lastStreet || "",
    user.lastLat ?? "",
    user.lastLng ?? "",
  ].join("|");

  if (primaryKey.replace(/\|/g, "").trim()) {
    seen.add(primaryKey);
  }

  const additional = [];

  for (const order of orders) {
    const key = [
      order.deliveryAddress || "",
      order.deliveryLat ?? "",
      order.deliveryLng ?? "",
    ].join("|");

    if (!order.deliveryAddress || seen.has(key)) {
      continue;
    }

    seen.add(key);
    additional.push({
      label: `Buyurtma ${order.orderNumber}`,
      street: order.deliveryAddress,
      apartment: "",
      floor: "",
      intercom: "",
      lat: order.deliveryLat ?? null,
      lng: order.deliveryLng ?? null,
      source: "order",
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
  }

  return additional;
}

function serializeProfile(user, additionalAddresses = []) {
  return {
    fullName: displayName(user.name),
    phone: user.phone,
    notifyOrders: user.notifyOrders !== false,
    ...primaryAddress(user),
    primaryAddress: primaryAddress(user),
    additionalAddresses,
    user: serializeUser(user),
  };
}

function serializeCustomerOrder(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryType: order.deliveryType || "DELIVERY",
    promoCode: order.promoCode || null,
    ...settledTotals(order),
    createdAt: order.createdAt,
    deliveryAddress: order.deliveryAddress,
    branch: order.branch
      ? {
          id: order.branch.id,
          name: order.branch.name,
          district: order.branch.district,
          phone: order.branch.phone || null,
        }
      : null,
    items: (order.items || []).map((item) => ({
      id: item.id,
      medicineId: item.medicineId,
      name: item.medicine?.name || "",
      slug: item.medicine?.slug || "",
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.unitPrice) * item.quantity,
      isPrescription: item.isPrescription,
    })),
    prescription: order.prescription
      ? {
          id: order.prescription.id,
          fileName: order.prescription.fileName,
          status: order.prescription.status,
          rejectNote: order.prescription.rejectNote || null,
          customerReason:
            order.prescription.status === "REJECTED"
              ? String(order.prescription.rejectNote || "").trim() || null
              : null,
          rejectReasons: order.prescription.rejectReasons || null,
        }
      : null,
    payment: order.payment
      ? {
          provider: order.payment.provider,
          status: order.payment.status,
        }
      : null,
    notes: order.notes || null,
    view: getCustomerOrderView(order),
  };
}

function serializeCustomerPrescription(prescription) {
  return {
    id: prescription.id,
    fileName: prescription.fileName,
    fileUrl: prescription.fileUrl || null,
    status: prescription.status,
    rejectNote: prescription.rejectNote || null,
    customerReason:
      prescription.status === "REJECTED" ? String(prescription.rejectNote || "").trim() || null : null,
    orderId: prescription.orderId,
    orderNumber: prescription.order?.orderNumber || null,
    orderStatus: prescription.order?.status || null,
    createdAt: prescription.createdAt,
  };
}

async function loadOwnCustomer(req) {
  if (!req.user || req.user.role !== "CUSTOMER") {
    throw new AppError("Faqat mijoz o'z ma'lumotini ko'ra oladi", 403, "FORBIDDEN");
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: userProfileSelect,
  });

  if (!user) {
    throw new AppError("Foydalanuvchi topilmadi", 404, "NOT_FOUND");
  }

  return user;
}

function orderWhereFor(user) {
  return {
    OR: [{ userId: user.id }, { customerPhone: user.phone }],
  };
}

const getProfile = asyncHandler(async (req, res) => {
  const user = await loadOwnCustomer(req);
  const phone = user.phone;

  const orders = await prisma.order.findMany({
    where: orderWhereFor(user),
    select: {
      id: true,
      orderNumber: true,
      deliveryAddress: true,
      deliveryLat: true,
      deliveryLng: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const additionalAddresses = buildAdditionalAddressesFromOrders(orders, user);

  return sendSuccess(res, serializeProfile(user, additionalAddresses), "Shaxsiy kabinet ma'lumotlari");
});

const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const current = await loadOwnCustomer(req);
  const phone = current.phone;
  const fullName = String(body.fullName || body.name || "").trim();
  const lastStreet = String(body.lastStreet || body.street || "").trim();

  let submittedAdditional = null;
  if (body.additionalAddresses != null) {
    if (!Array.isArray(body.additionalAddresses)) {
      throw new AppError(
        "additionalAddresses massiv ko'rinishida bo'lishi kerak",
        400,
        "VALIDATION_ERROR"
      );
    }

    submittedAdditional = body.additionalAddresses.map((entry, index) =>
      normalizeAddressEntry(entry, index)
    );
  }

  const renaming = Object.prototype.hasOwnProperty.call(body, "fullName") || Object.prototype.hasOwnProperty.call(body, "name");
  if (renaming && !displayName(fullName)) {
    throw new AppError("Ismingizni kiriting", 400, "VALIDATION_ERROR");
  }

  const user = await runDbTransaction(prisma, async (tx) => {
    const data = {};

    if (renaming) {
      data.name = displayName(fullName);
    }
    if (typeof body.notifyOrders === "boolean") {
      data.notifyOrders = body.notifyOrders;
    }

    if (lastStreet) {
      data.lastStreet = lastStreet;
      data.lastApartment =
        String(body.lastApartment || body.apartment || "").trim() || null;
      data.lastFloor = String(body.lastFloor || body.floor || "").trim() || null;
      data.lastIntercom =
        String(body.lastIntercom || body.intercom || "").trim() || null;
      data.lastLat = normalizeCoordinate(body.lastLat ?? body.lat);
      data.lastLng = normalizeCoordinate(body.lastLng ?? body.lng);
    } else if (
      body.lastApartment != null ||
      body.apartment != null ||
      body.lastFloor != null ||
      body.floor != null ||
      body.lastIntercom != null ||
      body.intercom != null ||
      body.lastLat != null ||
      body.lat != null ||
      body.lastLng != null ||
      body.lng != null
    ) {
      data.lastApartment =
        String(body.lastApartment || body.apartment || "").trim() || null;
      data.lastFloor = String(body.lastFloor || body.floor || "").trim() || null;
      data.lastIntercom =
        String(body.lastIntercom || body.intercom || "").trim() || null;
      data.lastLat = normalizeCoordinate(body.lastLat ?? body.lat);
      data.lastLng = normalizeCoordinate(body.lastLng ?? body.lng);
    }

    if (Object.keys(data).length === 0) {
      return current;
    }

    return tx.user.update({
      where: { id: current.id },
      data,
      select: userProfileSelect,
    });
  });

  const orders = await prisma.order.findMany({
    where: orderWhereFor(user),
    select: {
      id: true,
      orderNumber: true,
      deliveryAddress: true,
      deliveryLat: true,
      deliveryLng: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const additionalAddresses =
    submittedAdditional || buildAdditionalAddressesFromOrders(orders, user);

  return sendSuccess(res, serializeProfile(user, additionalAddresses), "Profil yangilandi");
});

const getCustomerOrders = asyncHandler(async (req, res) => {
  const user = await loadOwnCustomer(req);
  const phone = user.phone;
  const where = orderWhereFor(user);

  const orders = await prisma.order.findMany({
    where,
    include: orderListInclude,
    orderBy: { createdAt: "desc" },
  });

  return sendSuccess(
    res,
    {
      phone,
      total: orders.length,
      orders: orders.map(serializeCustomerOrder),
    },
    "Buyurtmalar tarixi"
  );
});

const getCustomerPrescriptions = asyncHandler(async (req, res) => {
  const user = await loadOwnCustomer(req);
  const phone = user.phone;

  const prescriptions = await prisma.prescription.findMany({
    where: {
      OR: [{ userId: user.id }, { order: { customerPhone: phone } }],
    },
    include: {
      order: {
        select: {
          orderNumber: true,
          status: true,
          customerPhone: true,
          notes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return sendSuccess(
    res,
    {
      phone,
      total: prescriptions.length,
      prescriptions: prescriptions.map(serializeCustomerPrescription),
    },
    "Retseptlar tarixi"
  );
});

const getAddress = asyncHandler(async (req, res) => {
  const user = await loadOwnCustomer(req);
  if (!user || !user.lastStreet) {
    return sendSuccess(res, null, "Saqlangan manzil yo'q");
  }
  return sendSuccess(res, addressPayload(user), "Saqlangan manzil");
});

const saveAddress = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const existing = await loadOwnCustomer(req);
  const phone = existing.phone;
  const street = String(body.street || "").trim();
  if (!street) {
    throw new AppError("Ko'cha manzili majburiy", 400, "VALIDATION_ERROR");
  }

  const lat = normalizeCoordinate(body.lat);
  const lng = normalizeCoordinate(body.lng);

  const data = {
    lastStreet: street,
    lastApartment: String(body.apartment || "").trim() || null,
    lastFloor: String(body.floor || "").trim() || null,
    lastIntercom: String(body.intercom || "").trim() || null,
    lastLat: lat,
    lastLng: lng,
  };

  if (displayName(body.fullName)) {
    data.name = displayName(body.fullName);
  }

  const user = await prisma.user.update({
    where: { phone },
    data,
    select: userProfileSelect,
  });

  return sendSuccess(res, { ...addressPayload(user), user: serializeUser(user) }, "Manzil saqlandi");
});

const listNotifications = asyncHandler(async (req, res) => {
  const user = await loadOwnCustomer(req);
  const [items, unread] = await Promise.all([
    prisma.customerNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.customerNotification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const orderIds = [...new Set(items.map((item) => item.orderId).filter(Boolean))];
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNumber: true },
      })
    : [];
  const numbers = new Map(orders.map((order) => [order.id, order.orderNumber]));
  return sendSuccess(
    res,
    {
      unread,
      items: items.map((item) => {
        const orderNumber = numbers.get(item.orderId) || "";
        const body =
          orderNumber && !String(item.body || "").includes(orderNumber)
            ? `${item.body} Buyurtma: ${orderNumber}`.trim()
            : item.body;
        return {
          id: item.id,
          orderId: item.orderId,
          orderNumber: orderNumber || null,
          title: item.title,
          body,
          read: Boolean(item.readAt),
          createdAt: item.createdAt,
        };
      }),
    },
    "Bildirishnomalar"
  );
});

const markNotificationsRead = asyncHandler(async (req, res) => {
  const user = await loadOwnCustomer(req);
  const id = String(req.body?.id || "").trim();
  await prisma.customerNotification.updateMany({
    where: { userId: user.id, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  const unread = await prisma.customerNotification.count({ where: { userId: user.id, readAt: null } });
  return sendSuccess(res, { unread }, "O'qildi");
});

module.exports = {
  getProfile,
  updateProfile,
  getCustomerOrders,
  getCustomerPrescriptions,
  getAddress,
  saveAddress,
  listNotifications,
  markNotificationsRead,
};
