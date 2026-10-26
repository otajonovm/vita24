const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { runDbTransaction } = require("../lib/transaction");
const {
  captureStock,
  expireStaleReservations,
  reservationDeadline,
  reservationForNextStatus,
  reserveStock,
} = require("../lib/stock");
const { displayName, provisionCustomer, serializeUser, userProfileSelect } = require("../lib/userProvisioning");
const { assertBranchAccess } = require("../middlewares/authMiddleware");
const { allowedTransitions } = require("../lib/orderState");
const { closedBranchMessage, pageWindow, resubmitExpired } = require("../lib/panelRules");
const { resolveRange } = require("../lib/dashboardStats");
const { isStorageKey, ownsPrescriptionKey } = require("../lib/prescriptionFiles");
const { prescriptionView } = require("./prescriptionController");
const { quoteTotals, settledTotals } = require("../lib/pricing");
const { getShopSettings, checkoutRulesFrom, assertPaymentAllowed } = require("../lib/shopSettings");
const { assertPromo, claimPromo, attachRedemption, reclaimPromo } = require("../lib/promo");
const { formatWorkingHours } = require("../lib/branchProfile");
const { captureAsPaid, emitOrder, notifyStatus, writeHistory } = require("../lib/orderFlow");
const { getCustomerOrderView, initialCustomerStatus } = require("../lib/customerOrderView");
const { assertCustomerCanOrder } = require("../lib/customerAccess");
const { applyOrderStatusChange } = require("../services/orderStatusService");
const { writeAudit } = require("../lib/audit");
const { assertRxOrder } = require("../lib/rxOrder");

const REVIEW_STATUSES = ["PENDING_PRESCRIPTION", "PENDING_BRANCH"];

function buildOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `VT-${stamp}-${suffix}`;
}

function serializeHistory(rows, forCustomer) {
  return (rows || [])
    .filter((row) => !forCustomer || row.kind !== "undo")
    .map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: forCustomer ? null : row.note || null,
      kind: row.kind || "status",
      createdAt: row.createdAt,
      actorName: forCustomer ? null : row.actor?.name || null,
      actorRole: forCustomer ? null : row.actor?.role || null,
    }));
}

function serializeOrder(order, { forCustomer = true } = {}) {
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
    ...(forCustomer
      ? {}
      : {
          pharmacistNote: order.pharmacistNote || "",
          adminNote: order.adminNote || "",
        }),
    refundStatus: order.refundStatus || "NONE",
    deliveryType: order.deliveryType || "DELIVERY",
    promoCode: order.promoCode || null,
    ...settledTotals(order),
    reservedUntil: order.reservedUntil,
    createdAt: order.createdAt,
    statusChangedAt: order.statusChangedAt,
    userId: order.userId,
    user: order.user ? serializeUser(order.user) : undefined,
    branch: order.branch
      ? {
          id: order.branch.id,
          name: order.branch.name,
          district: order.branch.district,
          phone: order.branch.phone || null,
          address: order.branch.address || "",
          workingHours: formatWorkingHours(order.branch.workingHours),
        }
      : undefined,
    items: (order.items || []).map((item) => ({
      id: item.id,
      medicineId: item.medicineId,
      name: item.medicine?.name,
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
          fileUrl: isStorageKey(order.prescription.fileUrl)
            ? prescriptionView(order.prescription)
            : null,
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
          id: order.payment.id,
          amount: Number(order.payment.amount),
          provider: order.payment.provider,
          status: order.payment.status,
          paidAt: order.payment.paidAt,
        }
      : null,
    history: serializeHistory(order.history, forCustomer),
    view: getCustomerOrderView(order),
  };
}

const orderInclude = {
  user: { select: { id: true, name: true, phone: true, role: true, createdAt: true } },
  branch: { select: { id: true, name: true, district: true, phone: true, address: true, workingHours: true } },
  items: { include: { medicine: { select: { name: true, slug: true } } } },
  prescription: true,
  payment: true,
  history: { orderBy: { createdAt: "asc" } },
};

const createOrder = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const body = req.body || {};
  if (!req.user || req.user.role !== "CUSTOMER") {
    throw new AppError("Buyurtma faqat mijoz hisobidan yaratiladi", 403, "FORBIDDEN");
  }
  const phone = req.user.phone;
  const typedName = displayName(body.fullName || body.customerName);
  const fullName = typedName || displayName(req.user.name);
  const deliveryType = body.deliveryType === "PICKUP" ? "PICKUP" : "DELIVERY";
  const deliveryAddress = body.deliveryAddress;
  const branchId = body.branchId;
  const items = body.items;
  const notes = body.notes;
  const prescriptionFileKey = body.prescriptionFileKey || null;
  const prescriptionFileName = body.prescriptionFileName || body.prescription?.fileName || "retsept";

  if (body.prescriptionUrl && String(body.prescriptionUrl).startsWith("data:")) {
    throw new AppError("Retseptni fayl sifatida yuklang", 400, "PRESCRIPTION_REQUIRED");
  }
  if (prescriptionFileKey && !ownsPrescriptionKey(prescriptionFileKey, req.user.id)) {
    throw new AppError("Retsept fayli shu mijozga tegishli emas", 403, "PRESCRIPTION_FORBIDDEN");
  }

  if (!fullName) {
    throw new AppError("Ismingizni kiriting", 400, "VALIDATION_ERROR");
  }
  if (!branchId || (deliveryType !== "PICKUP" && !deliveryAddress)) {
    throw new AppError(
      "phone, fullName, deliveryAddress va branchId majburiy",
      400,
      "VALIDATION_ERROR"
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Savatcha bo'sh", 400, "VALIDATION_ERROR");
  }

  const shop = await getShopSettings();
  assertPaymentAllowed(shop, body.paymentMethod, deliveryType);

  const { order, user } = await runDbTransaction(prisma, async (tx) => {
    const account = await tx.user.findUnique({
      where: { id: req.user.id },
      select: { status: true, blockReason: true, deletedAt: true },
    });
    assertCustomerCanOrder(account);

    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (!branch || !branch.isActive || branch.archivedAt) {
      throw new AppError("Filial topilmadi yoki faol emas", 404, "NOT_FOUND");
    }
    const closed = closedBranchMessage(branch);
    if (closed) {
      throw new AppError(closed, 409, "BRANCH_CLOSED");
    }

    const provisioned = await provisionCustomer(tx, { phone, fullName });
    let customer = provisioned.user;
    if (!displayName(customer.name)) {
      customer = await tx.user.update({
        where: { id: customer.id },
        data: { name: fullName },
        select: userProfileSelect,
      });
    }
    const orderName = typedName || displayName(customer.name) || fullName;

    const medicineIds = items.map((item) => item.medicineId);
    const medicines = await tx.medicine.findMany({
      where: { id: { in: medicineIds } },
    });

    if (medicines.length !== new Set(medicineIds).size) {
      throw new AppError("Ba'zi dorilar katalogda topilmadi", 404, "NOT_FOUND");
    }
    if (medicines.some((medicine) => medicine.isActive === false)) {
      throw new AppError("Nofaol dori buyurtmaga qo'shilmaydi", 409, "MEDICINE_INACTIVE");
    }

    const medicineMap = new Map(medicines.map((medicine) => [medicine.id, medicine]));
    const hasRxItems = assertRxOrder(medicines, prescriptionFileKey);

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

      const unitPrice = Math.round(Number(stock.price) * 100) / 100;
      subtotal = Math.round((subtotal + unitPrice * quantity) * 100) / 100;
      preparedItems.push({
        medicineId: medicine.id,
        quantity,
        unitPrice,
        isPrescription: medicine.isPrescription,
      });
    }

    let discount = 0;
    let promoCode = null;
    let claimedPromo = null;
    const rawCode = String(body.promoCode || "").trim().toUpperCase();
    if (rawCode) {
      claimedPromo = await claimPromo(tx, {
        code: rawCode,
        subtotal,
        branchId,
        userId: customer.id,
      });
      discount = claimedPromo.discount;
      promoCode = claimedPromo.code;
    }

    const quote = quoteTotals(subtotal, {
      deliveryType,
      discount,
      deliveryFee: shop.deliveryFee,
      freeFrom: shop.freeDeliveryFrom,
    });
    const placed = initialCustomerStatus({ hasRx: hasRxItems, paymentMethod: body.paymentMethod });
    const createdOrder = await tx.order.create({
      data: {
        orderNumber: buildOrderNumber(),
        userId: customer.id,
        branchId,
        status: placed.status,
        customerName: orderName,
        customerPhone: customer.phone,
        deliveryAddress: deliveryType === "PICKUP" ? branch.address : String(deliveryAddress).trim(),
        deliveryLat: deliveryType === "PICKUP" ? null : Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
        deliveryLng: deliveryType === "PICKUP" ? null : Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
        deliveryType,
        deliveryFee: quote.deliveryFee,
        discount: quote.discount,
        promoCode,
        notes: notes ? String(notes).trim() : null,
        subtotal,
        checkoutRules: checkoutRulesFrom(shop),
        reservedUntil: placed.reservation === "none" ? new Date(Date.now() + 24 * 60 * 60 * 1000) : reservationDeadline(placed.reservation, shop),
        items: { create: preparedItems },
        payment: {
          create: {
            amount: quote.totalAmount,
            provider: ["PAYME", "CLICK", "CASH"].includes(String(body.paymentMethod || "").toUpperCase())
              ? String(body.paymentMethod).toUpperCase()
              : "CASH",
            status: "PENDING",
          },
        },
        ...(hasRxItems
          ? {
              prescription: {
                create: {
                  userId: customer.id,
                  fileUrl: prescriptionFileKey,
                  fileName: prescriptionFileName,
                  status: "PENDING",
                },
              },
            }
          : {}),
      },
      include: orderInclude,
    });

    if (claimedPromo) {
      await attachRedemption(tx, {
        promoId: claimedPromo.id,
        orderId: createdOrder.id,
        userId: customer.id,
        discount,
      });
    }

    if (placed.capture) await captureStock(tx, createdOrder);

    const updatedUser = await tx.user.update({
      where: { id: customer.id },
      data: {
        name: displayName(customer.name) || orderName,
        ...(deliveryType === "PICKUP"
          ? {}
          : {
              lastStreet: String(body.street || deliveryAddress).trim(),
              lastApartment: String(body.apartment || "").trim() || null,
              lastFloor: String(body.floor || "").trim() || null,
              lastIntercom: String(body.intercom || "").trim() || null,
              lastLat: Number.isFinite(Number(body.lat)) ? Number(body.lat) : null,
              lastLng: Number.isFinite(Number(body.lng)) ? Number(body.lng) : null,
            }),
      },
    });

    return { order: createdOrder, user: updatedUser };
  });

  emitOrder(order.branchId, order);
  if (order.status === "PREPARING") notifyStatus(order, "PREPARING");

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

const listInclude = {
  branch: { select: { id: true, name: true } },
  payment: { select: { provider: true, status: true, amount: true } },
  prescription: { select: { id: true, status: true, fileName: true, rejectNote: true } },
};

function serializeOrderList(order) {
  const totals = settledTotals(order);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    branchId: order.branchId,
    branch: order.branch ? { id: order.branch.id, name: order.branch.name } : null,
    deliveryType: order.deliveryType || "DELIVERY",
    refundStatus: order.refundStatus || "NONE",
    promoCode: order.promoCode || null,
    ...totals,
    createdAt: order.createdAt,
    payment: order.payment
      ? {
          provider: order.payment.provider,
          status: order.payment.status,
          amount: Number(order.payment.amount),
        }
      : null,
    prescription: order.prescription
      ? {
          id: order.prescription.id,
          status: order.prescription.status,
          fileName: order.prescription.fileName,
          rejectNote: order.prescription.rejectNote || null,
        }
      : null,
  };
}

function listWhere(query, scopedBranchId) {
  const where = {};
  if (scopedBranchId) where.branchId = scopedBranchId;
  if (query.queue === "review") {
    where.status = { in: ["PENDING_PRESCRIPTION", "PENDING_BRANCH"] };
    where.prescription = { isNot: null };
  } else if (query.status === "REJECTED") {
    where.prescription = { is: { status: "REJECTED" } };
  } else if (query.status) {
    where.status = query.status;
  }
  if (query.wait === "long") {
    where.status = "PENDING_PRESCRIPTION";
  }
  if (query.deliveryType) where.deliveryType = query.deliveryType;
  if (query.refundStatus) where.refundStatus = query.refundStatus;
  if (query.paymentProvider || query.paymentStatus) {
    where.payment = {
      is: {
        ...(query.paymentProvider ? { provider: query.paymentProvider } : {}),
        ...(query.paymentStatus ? { status: query.paymentStatus } : {}),
      },
    };
  }
  const createdAt = {};
  if (query.from || query.to) {
    const range = resolveRange(query);
    if (range.error) throw new AppError(range.error, 400, "VALIDATION_ERROR");
    createdAt.gte = range.start;
    createdAt.lt = range.end;
  }
  if (query.wait === "long") {
    createdAt.lte = new Date(Date.now() - 30 * 60 * 1000);
  }
  if (Object.keys(createdAt).length) where.createdAt = createdAt;
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q, mode: "insensitive" } },
      { customerName: { contains: query.q, mode: "insensitive" } },
      { customerPhone: { contains: query.q } },
    ];
  }
  return where;
}

const listOrders = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const scopedBranchId = assertBranchAccess(req, req.query.branchId || null);
  const where = listWhere(req.query, scopedBranchId);
  const { page, limit, skip } = pageWindow(req.query);
  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: listInclude,
      orderBy: { createdAt: req.query.sort === "wait" ? "asc" : "desc" },
      skip,
      take: limit,
    }),
  ]);

  return sendSuccess(
    res,
    {
      items: orders.map(serializeOrderList),
      total,
      page,
      limit,
      hasMore: skip + orders.length < total,
    },
    "Buyurtmalar ro'yxati"
  );
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

  if (req.user.role === "CUSTOMER") {
    const owns = order.userId === req.user.id || order.customerPhone === req.user.phone;
    if (!owns) {
      throw new AppError("Bu buyurtmaga ruxsat yo'q", 403, "FORBIDDEN");
    }
  } else {
    assertBranchAccess(req, order.branchId);
  }

  const actorIds = [...new Set((order.history || []).map((row) => row.userId).filter(Boolean))];
  if (actorIds.length) {
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, role: true },
    });
    const byId = new Map(actors.map((actor) => [actor.id, actor]));
    order.history = order.history.map((row) => ({ ...row, actor: byId.get(row.userId) || null }));
  }

  const forCustomer = req.user.role === "CUSTOMER";
  const payload = serializeOrder(order, { forCustomer });
  if (!forCustomer) {
    payload.allowedStatuses = allowedTransitions({
      from: order.status,
      role: req.user.role,
      deliveryType: order.deliveryType,
      payment: order.payment,
    });
  }

  return sendSuccess(res, payload, "Buyurtma tafsiloti");
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  await expireStaleReservations();

  const requested = req.body?.status;
  const currentOrder = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      branchId: true,
      userId: true,
      customerPhone: true,
    },
  });
  if (!currentOrder) {
    throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  }

  if (req.user.role === "CUSTOMER") {
    const owns =
      currentOrder.userId === req.user.id || currentOrder.customerPhone === req.user.phone;
    if (!owns) throw new AppError("Bu buyurtmaga ruxsat yo'q", 403, "FORBIDDEN");
  } else if (req.user.role === "BRANCH_ADMIN") {
    assertBranchAccess(req, currentOrder.branchId, { write: true });
  } else if (req.user.role === "SUPER_ADMIN") {
    // Platforma egasi — faqat bekor qilish (orderState); filialni o'qish
    assertBranchAccess(req, currentOrder.branchId);
  } else {
    throw new AppError("Bu amal uchun ruxsat yo'q", 403, "FORBIDDEN");
  }

  const reason = String(req.body?.reason || req.body?.cancelReason || req.body?.rejectNote || "").trim();
  const result = await applyOrderStatusChange({
    orderId: req.params.id,
    requestedStatus: requested,
    reason,
    user: req.user,
    req,
    orderInclude,
    serialize: (order) => serializeOrder(order, { forCustomer: req.user.role === "CUSTOMER" }),
  });

  return sendSuccess(res, result.order, result.message);
});

const mockPay = asyncHandler(async (req, res) => {
  if (String(process.env.ENABLE_MOCK_PAY || "").toLowerCase() !== "true") {
    throw new AppError("Mock to'lov o'chirilgan", 404, "NOT_FOUND");
  }

  await expireStaleReservations();

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true, payment: true },
  });

  if (!order) {
    throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  }

  if (req.user.role !== "CUSTOMER") {
    throw new AppError("Mock to'lov faqat mijoz uchun", 403, "FORBIDDEN");
  }
  const owns = order.userId === req.user.id || order.customerPhone === req.user.phone;
  if (!owns) throw new AppError("Bu buyurtmaga ruxsat yo'q", 403, "FORBIDDEN");

  if (String(order.payment?.provider || "").toUpperCase() === "CASH") {
    throw new AppError("Naqd buyurtmada online to'lov yo'q", 409, "PAYMENT_NOT_ALLOWED");
  }

  if (order.status === "PAID") {
    const current = await prisma.order.findUnique({
      where: { id: order.id },
      include: orderInclude,
    });
    return sendSuccess(res, serializeOrder(current), "To'lov allaqachon qabul qilingan");
  }

  if (["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(order.status)) {
    throw new AppError("Buyurtma farmatsevt tekshiruvida", 409, "PAYMENT_NOT_ALLOWED");
  }

  if (order.status !== "WAITING_PAYMENT") {
    throw new AppError(
      "To'lov faqat farmatsevt tasdiqlagan buyurtmalar uchun mumkin",
      409,
      "PAYMENT_NOT_ALLOWED"
    );
  }

  if (order.reservedUntil < new Date()) {
    throw new AppError("Zaxira muddati tugagan", 409, "RESERVATION_EXPIRED");
  }

  const updated = await runDbTransaction(prisma, async (tx) => {
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

    if (["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(locked.status)) {
      throw new AppError("Buyurtma farmatsevt tekshiruvida", 409, "PAYMENT_NOT_ALLOWED");
    }

    if (locked.status !== "WAITING_PAYMENT") {
      throw new AppError(
        "To'lov faqat farmatsevt tasdiqlagan buyurtmalar uchun mumkin",
        409,
        "PAYMENT_NOT_ALLOWED"
      );
    }

    if (locked.reservedUntil < new Date()) {
      throw new AppError("Zaxira muddati tugagan", 409, "RESERVATION_EXPIRED");
    }

    await captureAsPaid(tx, locked, { kind: "system", note: "To'lov qabul qilindi" });

    if (locked.payment) {
      await tx.paymentTransaction.update({
        where: { id: locked.payment.id },
        data: {
          status: "COMPLETED",
          paidAt: new Date(),
        },
      });
    }

    return tx.order.update({
      where: { id: locked.id },
      data: { status: "PAID", statusChangedAt: new Date() },
      include: orderInclude,
    });
  });

  emitOrder(updated.branchId, updated);
  notifyStatus(updated, "PAID");
  return sendSuccess(res, serializeOrder(updated), "Mock to'lov muvaffaqiyatli yakunlandi");
});

const replaceOrderPrescription = asyncHandler(async (req, res) => {
  const fileKey = String(req.body?.prescriptionFileKey || "").trim();
  const fileName = String(req.body?.prescriptionFileName || "retsept").trim() || "retsept";
  if (!ownsPrescriptionKey(fileKey, req.user.id)) {
    throw new AppError("Retsept fayli shu mijozga tegishli emas", 403, "PRESCRIPTION_FORBIDDEN");
  }

  const updated = await runDbTransaction(prisma, async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { medicine: { select: { name: true, isActive: true } } } },
        prescription: true,
        payment: true,
        promoRedemption: true,
      },
    });
    if (!current) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
    const owns = current.userId === req.user.id || current.customerPhone === req.user.phone;
    if (!owns) throw new AppError("Bu buyurtmaga ruxsat yo'q", 403, "FORBIDDEN");
    if (current.prescription?.status !== "REJECTED") {
      throw new AppError("Faqat rad etilgan retseptni qayta yuklash mumkin", 409, "INVALID_STATUS");
    }
    if (resubmitExpired(current)) {
      throw new AppError("Retseptni qayta yuborish muddati tugagan", 409, "RESUBMIT_EXPIRED");
    }

    let subtotal = 0;
    for (const item of current.items) {
      const medicine = item.medicine;
      if (!medicine || medicine.isActive === false) {
        throw new AppError("Nofaol dori buyurtmaga qo'shilmaydi", 409, "MEDICINE_INACTIVE");
      }
      const stock = await reserveStock(tx, {
        branchId: current.branchId,
        medicineId: item.medicineId,
        quantity: item.quantity,
        medicineName: medicine.name,
      });
      const unitPrice = Math.round(Number(stock.price) * 100) / 100;
      subtotal = Math.round((subtotal + unitPrice * item.quantity) * 100) / 100;
      if (Number(item.unitPrice) !== unitPrice) {
        await tx.orderItem.update({ where: { id: item.id }, data: { unitPrice } });
      }
    }

    let discount = 0;
    if (current.promoCode) {
      const promo = await tx.promoCode.findUnique({
        where: { code: String(current.promoCode).trim().toUpperCase() },
        include: { branches: { select: { branchId: true } } },
      });
      const userUses = promo?.perUserLimit == null
        ? 0
        : await tx.promoRedemption.count({
            where: {
              promoId: promo.id,
              userId: req.user.id,
              releasedAt: null,
              NOT: { orderId: current.id },
            },
          });
      discount = assertPromo(promo, subtotal, new Date(), { branchId: current.branchId, userUses });
      await reclaimPromo(tx, current);
      if (current.promoRedemption) {
        await tx.promoRedemption.update({
          where: { id: current.promoRedemption.id },
          data: { discount },
        });
      }
    }

    const rules = current.checkoutRules || {};
    const quote = quoteTotals(subtotal, {
      deliveryType: current.deliveryType,
      discount,
      deliveryFee: rules.deliveryFee,
      freeFrom: rules.freeDeliveryFrom,
    });

    await tx.prescription.update({
      where: { id: current.prescription.id },
      data: {
        fileUrl: fileKey,
        fileName,
        status: "PENDING",
        rejectNote: null,
        rejectReasons: null,
      },
    });
    if (current.payment && current.payment.status !== "COMPLETED") {
      await tx.paymentTransaction.update({
        where: { id: current.payment.id },
        data: { status: "PENDING", amount: quote.totalAmount },
      });
    }
    await tx.order.update({
      where: { id: current.id },
      data: {
        status: "PENDING_PRESCRIPTION",
        notes: null,
        refundStatus: "NONE",
        subtotal: quote.subtotal,
        deliveryFee: quote.deliveryFee,
        discount: quote.discount,
        reservedUntil: reservationDeadline("review", current.checkoutRules),
        statusChangedAt: new Date(),
      },
    });
    await writeHistory(tx, {
      orderId: current.id,
      fromStatus: current.status,
      toStatus: "PENDING_PRESCRIPTION",
      userId: req.user.id,
      note: "Retsept qayta yuborildi",
    });
    return tx.order.findUnique({ where: { id: current.id }, include: orderInclude });
  });

  emitOrder(updated.branchId, updated);
  return sendSuccess(res, serializeOrder(updated), "Retsept qayta yuborildi");
});

const checkPromo = asyncHandler(async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const subtotal = Number(req.body.subtotal);
  const branchId = String(req.body.branchId || "").trim();
  const promo = await prisma.promoCode.findUnique({
    where: { code },
    include: { branches: { select: { branchId: true } } },
  });
  const userUses = promo?.perUserLimit == null
    ? 0
    : await prisma.promoRedemption.count({
        where: { promoId: promo.id, userId: req.user.id, releasedAt: null },
      });
  const discount = assertPromo(promo, subtotal, new Date(), { branchId, userUses });
  return sendSuccess(
    res,
    { code: promo.code, discount, type: promo.type, value: Number(promo.value) },
    "Promokod qo'llandi"
  );
});

const updateAdminNote = asyncHandler(async (req, res) => {
  if (req.user.role !== "SUPER_ADMIN") {
    throw new AppError("Bu amal uchun ruxsat yo'q", 403, "FORBIDDEN");
  }
  const current = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true, branchId: true, adminNote: true, orderNumber: true },
  });
  if (!current) throw new AppError("Buyurtma topilmadi", 404, "NOT_FOUND");
  const adminNote = String(req.body?.adminNote || "").trim();
  const updated = await prisma.order.update({
    where: { id: current.id },
    data: { adminNote: adminNote || null },
    include: orderInclude,
  });
  await writeAudit(prisma, {
    req,
    action: "ADMIN_NOTE",
    entityType: "Order",
    entityId: current.id,
    branchId: current.branchId,
    summary: `${current.orderNumber || current.id} admin izohi yangilandi`,
    before: { adminNote: current.adminNote || "" },
    after: { adminNote },
  });
  return sendSuccess(res, serializeOrder(updated, { forCustomer: false }), "Admin izohi saqlandi");
});

module.exports = {
  createOrder,
  checkPromo,
  listOrders,
  getOrderById,
  updateOrderStatus,
  updateAdminNote,
  mockPay,
  replaceOrderPrescription,
};
