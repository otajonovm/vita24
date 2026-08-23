const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const {
  captureStock,
  expireStaleReservations,
  releaseReservation,
  reservationDeadline,
  reserveStock,
} = require("../lib/stock");
const { provisionCustomer, serializeUser } = require("../lib/userProvisioning");

const REVIEW_STATUSES = ["PENDING_PRESCRIPTION", "PENDING_BRANCH"];

function buildOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `VT-${stamp}-${suffix}`;
}

function serializeOrder(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    deliveryLat: order.deliveryLat ?? null,
    deliveryLng: order.deliveryLng ?? null,
    notes: order.notes,
    subtotal: Number(order.subtotal),
    reservedUntil: order.reservedUntil,
    createdAt: order.createdAt,
    userId: order.userId,
    user: order.user ? serializeUser(order.user) : undefined,
    branch: order.branch
      ? {
          id: order.branch.id,
          name: order.branch.name,
          district: order.branch.district,
        }
      : undefined,
    items: (order.items || []).map((item) => ({
      id: item.id,
      medicineId: item.medicineId,
      name: item.medicine?.name,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      isPrescription: item.isPrescription,
    })),
    prescription: order.prescription
      ? {
          id: order.prescription.id,
          fileName: order.prescription.fileName,
          fileUrl: order.prescription.fileUrl,
          status: order.prescription.status,
        }
      : null,
    payment: order.payment
      ? {
          id: order.payment.id,
          amount: Number(order.payment.amount),
          provider: order.payment.provider,
          status: order.payment.status,
          paidAt: order.payment.paidAt,
        }
      : null,
  };
}

const orderInclude = {
  user: { select: { id: true, name: true, phone: true, role: true, createdAt: true } },
  branch: { select: { id: true, name: true, district: true } },
  items: { include: { medicine: { select: { name: true } } } },
  prescription: true,
  payment: true,
};

const createOrder = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const body = req.body || {};
  const phone = body.phone || body.customerPhone;
  const fullName = body.fullName || body.customerName;
  const deliveryAddress = body.deliveryAddress;
  const branchId = body.branchId;
  const items = body.items;
  const notes = body.notes;
  const prescriptionUrl =
    body.prescriptionUrl || body.prescription?.fileUrl || null;
  const prescriptionFileName = body.prescription?.fileName || "retsept";

  if (!phone || !fullName || !deliveryAddress || !branchId) {
    throw new AppError(
      "phone, fullName, deliveryAddress va branchId majburiy",
      400,
      "VALIDATION_ERROR"
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Savatcha bo'sh", 400, "VALIDATION_ERROR");
  }

  const { order, user } = await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive) {
      throw new AppError("Filial topilmadi yoki faol emas", 404, "NOT_FOUND");
    }

    const { user: customer } = await provisionCustomer(tx, { phone, fullName });

    const medicineIds = items.map((item) => item.medicineId);
    const medicines = await tx.medicine.findMany({
      where: { id: { in: medicineIds } },
    });

    if (medicines.length !== new Set(medicineIds).size) {
      throw new AppError("Ba'zi dorilar katalogda topilmadi", 404, "NOT_FOUND");
    }

    const medicineMap = new Map(medicines.map((medicine) => [medicine.id, medicine]));
    const hasRxItems = medicines.some((medicine) => medicine.isPrescription);

    if (hasRxItems && !prescriptionUrl) {
      throw new AppError(
        "Retseptli dorilar uchun retsept yuklash majburiy",
        400,
        "PRESCRIPTION_REQUIRED"
      );
    }

    const mergedQty = new Map();
    for (const line of items) {
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new AppError("Miqdor noto'g'ri", 400, "VALIDATION_ERROR");
      }
      if (!medicineMap.has(line.medicineId)) {
        throw new AppError("Dori topilmadi", 404, "NOT_FOUND");
      }
      mergedQty.set(line.medicineId, (mergedQty.get(line.medicineId) || 0) + quantity);
    }

    const preparedItems = [];
    let subtotal = 0;

    for (const [medicineId, quantity] of mergedQty.entries()) {
      const medicine = medicineMap.get(medicineId);
      const stock = await reserveStock(tx, {
        branchId,
        medicineId,
        quantity,
        medicineName: medicine.name,
      });

      if (!stock) {
        throw new AppError(
          `${medicine.name} ushbu filialda mavjud emas`,
          400,
          "STOCK_UNAVAILABLE"
        );
      }

      const unitPrice = Number(stock.price);
      subtotal += unitPrice * quantity;
      preparedItems.push({
        medicineId: medicine.id,
        quantity,
        unitPrice,
        isPrescription: medicine.isPrescription,
      });
    }

    const createdOrder = await tx.order.create({
      data: {
        orderNumber: buildOrderNumber(),
        userId: customer.id,
        branchId,
        status: hasRxItems ? "PENDING_PRESCRIPTION" : "WAITING_PAYMENT",
        customerName: customer.name,
        customerPhone: customer.phone,
        deliveryAddress: String(deliveryAddress).trim(),
        deliveryLat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
        deliveryLng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
        notes: notes ? String(notes).trim() : null,
        subtotal,
        reservedUntil: reservationDeadline(),
        items: { create: preparedItems },
        payment: {
          create: {
            amount: subtotal,
            provider: "MOCK",
            status: "PENDING",
          },
        },
        ...(hasRxItems
          ? {
              prescription: {
                create: {
                  userId: customer.id,
                  fileUrl: prescriptionUrl,
                  fileName: prescriptionFileName,
                  status: "PENDING",
                },
              },
            }
          : {}),
      },
      include: orderInclude,
    });

    const updatedUser = await tx.user.update({
      where: { id: customer.id },
      data: {
        name: customer.name,
        lastStreet: String(body.street || deliveryAddress).trim(),
        lastApartment: String(body.apartment || "").trim() || null,
        lastFloor: String(body.floor || "").trim() || null,
        lastIntercom: String(body.intercom || "").trim() || null,
        lastLat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
        lastLng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
      },
    });

    return { order: createdOrder, user: updatedUser };
  });

  return sendSuccess(
    res,
    {
      order: serializeOrder(order),
      user: serializeUser(user),
    },
    "Buyurtma qabul qilindi",
    201
  );
});

const listOrders = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const { branchId, status } = req.query;
  const orders = await prisma.order.findMany({
    where: {
      ...(branchId ? { branchId: String(branchId) } : {}),
      ...(status ? { status: String(status) } : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
  });

  return sendSuccess(res, orders.map(serializeOrder), "Buyurtmalar ro'yxati");
});

const getOrderById = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: orderInclude,
  });

  if (!order) {
    throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  }

  return sendSuccess(res, serializeOrder(order), "Buyurtma tafsiloti");
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const nextStatus = req.body?.status;
  if (!["WAITING_PAYMENT", "CANCELLED"].includes(nextStatus)) {
    throw new AppError(
      "Faqat WAITING_PAYMENT yoki CANCELLED holatiga o'tish mumkin",
      400,
      "INVALID_STATUS"
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: {
        id: req.params.id,
        status: { in: REVIEW_STATUSES },
      },
      data: { status: nextStatus },
    });

    if (claimed.count !== 1) {
      throw new AppError(
        "Bu buyurtma farmatsevt tasdig'ini kutmayapti",
        409,
        "INVALID_STATUS"
      );
    }

    const current = await tx.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, prescription: true, payment: true },
    });

    if (nextStatus === "CANCELLED") {
      await releaseReservation(tx, current);
      if (current.prescription) {
        await tx.prescription.update({
          where: { id: current.prescription.id },
          data: { status: "REJECTED" },
        });
      }
      if (current.payment) {
        await tx.paymentTransaction.update({
          where: { id: current.payment.id },
          data: { status: "FAILED" },
        });
      }
    }

    if (nextStatus === "WAITING_PAYMENT" && current.prescription) {
      await tx.prescription.update({
        where: { id: current.prescription.id },
        data: { status: "APPROVED" },
      });
    }

    return tx.order.findUnique({
      where: { id: current.id },
      include: orderInclude,
    });
  });

  return sendSuccess(
    res,
    serializeOrder(updated),
    nextStatus === "WAITING_PAYMENT"
      ? "Buyurtma tasdiqlandi, to'lov kutilmoqda"
      : "Buyurtma rad etildi, zaxira qaytarildi"
  );
});

const mockPay = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true, payment: true },
  });

  if (!order) {
    throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  }

  if (order.status === "PAID") {
    const current = await prisma.order.findUnique({
      where: { id: order.id },
      include: orderInclude,
    });
    return sendSuccess(res, serializeOrder(current), "To'lov allaqachon qabul qilingan");
  }

  if (!["WAITING_PAYMENT", "PENDING_BRANCH"].includes(order.status)) {
    throw new AppError(
      "To'lov faqat farmatsevt tasdiqlagan buyurtmalar uchun mumkin",
      409,
      "PAYMENT_NOT_ALLOWED"
    );
  }

  if (order.reservedUntil < new Date()) {
    throw new AppError("Zaxira muddati tugagan", 409, "RESERVATION_EXPIRED");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const locked = await tx.order.findUnique({
      where: { id: order.id },
      include: { items: true, payment: true },
    });

    if (!locked) {
      throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
    }

    if (locked.status === "PAID") {
      return tx.order.findUnique({
        where: { id: locked.id },
        include: orderInclude,
      });
    }

    if (!["WAITING_PAYMENT", "PENDING_BRANCH"].includes(locked.status)) {
      throw new AppError(
        "To'lov faqat farmatsevt tasdiqlagan buyurtmalar uchun mumkin",
        409,
        "PAYMENT_NOT_ALLOWED"
      );
    }

    if (locked.reservedUntil < new Date()) {
      throw new AppError("Zaxira muddati tugagan", 409, "RESERVATION_EXPIRED");
    }

    await captureStock(tx, locked);

    if (locked.payment) {
      await tx.paymentTransaction.update({
        where: { id: locked.payment.id },
        data: {
          status: "COMPLETED",
          provider: "MOCK",
          paidAt: new Date(),
        },
      });
    }

    return tx.order.update({
      where: { id: locked.id },
      data: { status: "PAID" },
      include: orderInclude,
    });
  });

  return sendSuccess(res, serializeOrder(updated), "Mock to'lov muvaffaqiyatli yakunlandi");
});

module.exports = {
  createOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  mockPay,
};
