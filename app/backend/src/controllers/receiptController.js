const fs = require("fs");
const multer = require("multer");
const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess, sendError } = require("../lib/response");
const { assertBranchAccess } = require("../middlewares/authMiddleware");
const { runDbTransaction } = require("../lib/transaction");
const { writeAudit } = require("../lib/audit");
const { settlePayment } = require("../lib/paymentSettlement");
const { emitOrder, notifyStatus, writeHistory } = require("../lib/orderFlow");
const { publish } = require("../lib/panelEvents");
const { expectedPayable } = require("../lib/paymentSettlement");
const { notifyCustomer, sendMessage } = require("../bot/services");
const {
  RECEIPT_REVIEW_MS,
  RECEIPT_REJECT_EXTEND_MS,
  RECEIPT_REJECT_REASONS,
  receiptRejectLabel,
} = require("../lib/cardTransfer");
const {
  MAX_BYTES,
  extensionFor,
  saveReceiptBuffer,
  readReceiptFile,
  isStorageKey,
  signReceiptAccess,
  verifyReceiptSignature,
} = require("../lib/paymentReceiptFiles");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!extensionFor(file.mimetype)) {
      cb(new AppError("Faqat JPG, PNG, WEBP, HEIC yoki PDF yuklash mumkin", 400, "INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

const uploadMiddleware = upload.single("file");

function serializeReceipt(receipt) {
  if (!receipt) return null;
  return {
    id: receipt.id,
    orderId: receipt.orderId,
    fileName: receipt.fileName,
    status: receipt.status,
    rejectReason: receipt.rejectReason || null,
    rejectLabel: receipt.rejectReason ? receiptRejectLabel(receipt.rejectReason) : null,
    reviewedAt: receipt.reviewedAt || null,
    createdAt: receipt.createdAt,
    fileUrl: isStorageKey(receipt.fileUrl) ? signReceiptAccess(receipt.id).url : null,
  };
}

function latestReceipt(receipts) {
  if (!Array.isArray(receipts) || !receipts.length) return null;
  return [...receipts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

function canReadReceipt(user, order) {
  if (!user || !order) return false;
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "BRANCH_ADMIN" || user.role === "MANAGER") {
    return order.branchId === user.branchId;
  }
  if (user.role === "CUSTOMER") {
    return order.userId === user.id || order.customerPhone === user.phone;
  }
  return false;
}

function emitCustomer(order, event) {
  if (!order?.userId) return;
  publish(`customer:${order.userId}`, {
    type: event.type || "order.updated",
    orderId: order.id,
    status: order.status,
    ...event,
  });
}

async function notifyBranchStaff(branchId, text) {
  if (!branchId || !text) return;
  try {
    const staff = await prisma.user.findMany({
      where: {
        branchId,
        role: { in: ["BRANCH_ADMIN", "MANAGER"] },
        status: "ACTIVE",
        telegramChatId: { not: null },
        deletedAt: null,
      },
      select: { telegramChatId: true },
    });
    for (const person of staff) {
      if (!person.telegramChatId) continue;
      await sendMessage(person.telegramChatId, text).catch(() => {});
    }
  } catch {
    // Telegram ixtiyoriy
  }
}

const uploadOrderReceipt = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Chek fayli majburiy", 400, "FILE_REQUIRED");
  }

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { payment: true, paymentReceipts: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  if (!order) throw new AppError("Buyurtma topilmadi", 404, "ORDER_NOT_FOUND");

  const owns = order.userId === req.user.id || order.customerPhone === req.user.phone;
  if (!owns) throw new AppError("Bu buyurtmaga ruxsat yo'q", 403, "FORBIDDEN");

  if (order.status !== "WAITING_PAYMENT") {
    throw new AppError("Chek faqat to'lov kutilayotganda yuklanadi", 409, "INVALID_STATUS");
  }
  if (String(order.payment?.provider || "").toUpperCase() !== "CARD_TRANSFER") {
    throw new AppError("Bu buyurtma kartaga o'tkazma emas", 409, "PAYMENT_NOT_ALLOWED");
  }
  if (order.reservedUntil < new Date()) {
    throw new AppError("Zaxira muddati tugagan", 409, "RESERVATION_EXPIRED");
  }

  const pending = (order.paymentReceipts || []).find((row) => row.status === "PENDING");
  if (pending) {
    throw new AppError("Chek tekshiruvda, yangisini yuklash mumkin emas", 409, "RECEIPT_PENDING");
  }

  const fileUrl = saveReceiptBuffer({
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    userId: req.user.id,
  });
  const reservedUntil = new Date(Date.now() + RECEIPT_REVIEW_MS);

  const receipt = await runDbTransaction(prisma, async (tx) => {
    const locked = await tx.order.findUnique({
      where: { id: order.id },
      include: { payment: true },
    });
    if (!locked || locked.status !== "WAITING_PAYMENT") {
      throw new AppError("Buyurtma holati o'zgargan", 409, "INVALID_STATUS");
    }
    const created = await tx.paymentReceipt.create({
      data: {
        orderId: order.id,
        fileUrl,
        fileName: req.file.originalname || "chek",
        status: "PENDING",
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { reservedUntil },
    });
    await writeAudit(tx, {
      req,
      action: "RECEIPT_UPLOADED",
      entityType: "PaymentReceipt",
      entityId: created.id,
      branchId: order.branchId,
      summary: `${order.orderNumber || order.id} chek yuklandi`,
      after: { fileName: created.fileName, status: "PENDING" },
    });
    return created;
  });

  emitOrder(order.branchId, { ...order, status: "WAITING_PAYMENT" });
  publish(order.branchId, {
    type: "receipt.uploaded",
    orderId: order.id,
    receiptId: receipt.id,
    status: "WAITING_PAYMENT",
  });
  emitCustomer(order, { type: "receipt.uploaded", receiptId: receipt.id, receiptStatus: "PENDING" });
  notifyBranchStaff(
    order.branchId,
    `Yangi chek tekshiruvga keldi. Buyurtma: ${order.orderNumber || order.id}`
  ).catch(() => {});

  return sendSuccess(
    res,
    {
      receipt: serializeReceipt(receipt),
      reservedUntil,
    },
    "Chek yuklandi",
    201
  );
});

const downloadReceipt = asyncHandler(async (req, res) => {
  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: req.params.receiptId },
    include: {
      order: { select: { id: true, branchId: true, customerPhone: true, userId: true } },
    },
  });
  if (!receipt || !isStorageKey(receipt.fileUrl)) {
    throw new AppError("Chek topilmadi", 404, "NOT_FOUND");
  }

  const signed = verifyReceiptSignature(req.params.receiptId, req.query.exp, req.query.sig);
  if (!signed) {
    if (!req.user) {
      return sendError(res, 401, "UNAUTHORIZED", "Chekni ko'rish uchun ruxsat kerak");
    }
    if (req.user.role === "BRANCH_ADMIN" || req.user.role === "MANAGER") {
      assertBranchAccess(req, receipt.order?.branchId);
    } else if (!canReadReceipt(req.user, receipt.order)) {
      throw new AppError("Bu chekka ruxsat yo'q", 403, "FORBIDDEN");
    }
  }

  const file = readReceiptFile(receipt.fileUrl);
  if (!file) throw new AppError("Chek fayli topilmadi", 404, "NOT_FOUND");

  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", `inline; filename="${receipt.fileName || "chek"}"`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(file.path).pipe(res);
});

const receiptLink = asyncHandler(async (req, res) => {
  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: req.params.receiptId },
    include: { order: { select: { branchId: true } } },
  });
  if (!receipt || !isStorageKey(receipt.fileUrl)) {
    throw new AppError("Chek topilmadi", 404, "NOT_FOUND");
  }
  if (req.user.role === "BRANCH_ADMIN" || req.user.role === "MANAGER") {
    assertBranchAccess(req, receipt.order?.branchId);
  } else if (req.user.role !== "SUPER_ADMIN") {
    throw new AppError("Bu chekka ruxsat yo'q", 403, "FORBIDDEN");
  }
  const signed = signReceiptAccess(receipt.id);
  return sendSuccess(res, { url: signed.url, expiresAt: new Date(signed.exp).toISOString() }, "Chek havolasi");
});

const approveReceipt = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      payment: true,
      paymentReceipts: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
      items: true,
    },
  });
  if (!order) throw new AppError("Buyurtma topilmadi", 404, "ORDER_NOT_FOUND");
  assertBranchAccess(req, order.branchId, { write: true });

  if (String(order.payment?.provider || "").toUpperCase() !== "CARD_TRANSFER") {
    throw new AppError("Bu buyurtma kartaga o'tkazma emas", 409, "PAYMENT_NOT_ALLOWED");
  }
  const receipt = order.paymentReceipts?.[0];
  if (!receipt) throw new AppError("Tekshiriladigan chek yo'q", 409, "RECEIPT_NOT_FOUND");

  const claimed = await prisma.paymentReceipt.updateMany({
    where: { id: receipt.id, status: "PENDING" },
    data: {
      status: "APPROVED",
      reviewedById: req.user.id,
      reviewedAt: new Date(),
      rejectReason: null,
    },
  });
  if (claimed.count !== 1) {
    throw new AppError("Chek allaqachon ko'rib chiqilgan", 409, "RECEIPT_CONFLICT");
  }

  try {
    await settlePayment({
      orderId: order.id,
      provider: "CARD_TRANSFER",
      externalId: `RCPT-${receipt.id}`,
      amount: expectedPayable(order),
    });
  } catch (error) {
    await prisma.paymentReceipt.update({
      where: { id: receipt.id },
      data: { status: "PENDING", reviewedById: null, reviewedAt: null },
    }).catch(() => {});
    throw error;
  }

  await writeAudit(prisma, {
    req,
    action: "RECEIPT_APPROVED",
    entityType: "PaymentReceipt",
    entityId: receipt.id,
    branchId: order.branchId,
    summary: `${order.orderNumber || order.id} chek tasdiqlandi`,
    after: { status: "APPROVED" },
  });

  const preparing = await runDbTransaction(prisma, async (tx) => {
    const current = await tx.order.findUnique({ where: { id: order.id }, include: { payment: true } });
    if (!current || current.status !== "PAID") return current;
    const moved = await tx.order.updateMany({
      where: { id: current.id, status: "PAID" },
      data: { status: "PREPARING", statusChangedAt: new Date() },
    });
    if (moved.count !== 1) return current;
    await writeHistory(tx, {
      orderId: current.id,
      fromStatus: "PAID",
      toStatus: "PREPARING",
      userId: req.user.id,
      note: "Kartaga o'tkazma tasdiqlandi",
    });
    return tx.order.findUnique({
      where: { id: current.id },
      include: { payment: true, paymentReceipts: { orderBy: { createdAt: "desc" } } },
    });
  });

  if (preparing) {
    emitOrder(preparing.branchId, preparing);
    emitCustomer(preparing, {
      type: "receipt.approved",
      receiptId: receipt.id,
      receiptStatus: "APPROVED",
      status: preparing.status,
    });
    notifyStatus(preparing, "PAID", "To'lov tasdiqlandi");
    if (preparing.status === "PREPARING") notifyStatus(preparing, "PREPARING");
  }

  return sendSuccess(
    res,
    {
      orderId: order.id,
      status: preparing?.status || "PAID",
      receipt: serializeReceipt({ ...receipt, status: "APPROVED", reviewedById: req.user.id, reviewedAt: new Date() }),
    },
    "To'lov tasdiqlandi"
  );
});

const rejectReceipt = asyncHandler(async (req, res) => {
  const reasonRaw = String(req.body?.reason || "").trim();
  if (!reasonRaw) throw new AppError("Rad etish sababi majburiy", 400, "VALIDATION_ERROR");

  const knownCode = Object.keys(RECEIPT_REJECT_REASONS).includes(reasonRaw) ? reasonRaw : null;
  const knownLabel = Object.values(RECEIPT_REJECT_REASONS).includes(reasonRaw) ? reasonRaw : null;
  const reasonCode =
    knownCode ||
    Object.entries(RECEIPT_REJECT_REASONS).find(([, label]) => label === knownLabel)?.[0] ||
    "OTHER";
  const reasonLabel = receiptRejectLabel(reasonCode === "OTHER" && !knownCode ? reasonRaw : reasonCode);

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      payment: true,
      paymentReceipts: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order) throw new AppError("Buyurtma topilmadi", 404, "ORDER_NOT_FOUND");
  assertBranchAccess(req, order.branchId, { write: true });

  if (order.status !== "WAITING_PAYMENT") {
    throw new AppError("Buyurtma to'lov tekshiruvida emas", 409, "INVALID_STATUS");
  }
  if (String(order.payment?.provider || "").toUpperCase() !== "CARD_TRANSFER") {
    throw new AppError("Bu buyurtma kartaga o'tkazma emas", 409, "PAYMENT_NOT_ALLOWED");
  }
  const receipt = order.paymentReceipts?.[0];
  if (!receipt) throw new AppError("Tekshiriladigan chek yo'q", 409, "RECEIPT_NOT_FOUND");

  const reservedUntil = new Date(Date.now() + RECEIPT_REJECT_EXTEND_MS);
  const updated = await runDbTransaction(prisma, async (tx) => {
    const claimed = await tx.paymentReceipt.updateMany({
      where: { id: receipt.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectReason: reasonLabel,
        reviewedById: req.user.id,
        reviewedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new AppError("Chek allaqachon ko'rib chiqilgan", 409, "RECEIPT_CONFLICT");
    }
    await tx.order.update({
      where: { id: order.id },
      data: { reservedUntil },
    });
    await writeAudit(tx, {
      req,
      action: "RECEIPT_REJECTED",
      entityType: "PaymentReceipt",
      entityId: receipt.id,
      branchId: order.branchId,
      summary: `${order.orderNumber || order.id} chek rad etildi: ${reasonLabel}`,
      after: { status: "REJECTED", reason: reasonLabel },
    });
    return tx.paymentReceipt.findUnique({ where: { id: receipt.id } });
  });

  emitOrder(order.branchId, { ...order, reservedUntil });
  publish(order.branchId, {
    type: "receipt.rejected",
    orderId: order.id,
    receiptId: receipt.id,
    status: "WAITING_PAYMENT",
  });
  emitCustomer(order, {
    type: "receipt.rejected",
    receiptId: receipt.id,
    receiptStatus: "REJECTED",
    reason: reasonLabel,
  });

  const phone = order.customerPhone;
  const body = `To'lov cheki rad etildi. Sabab: ${reasonLabel}. Buyurtma: ${order.orderNumber || ""}`.trim();
  if (order.userId) {
    await prisma.customerNotification
      .create({
        data: {
          userId: order.userId,
          orderId: order.id,
          title: "Chek rad etildi",
          body,
        },
      })
      .catch(() => {});
  }
  if (phone) notifyCustomer(phone, body).catch(() => {});

  return sendSuccess(
    res,
    {
      orderId: order.id,
      status: "WAITING_PAYMENT",
      reservedUntil,
      receipt: serializeReceipt(updated),
    },
    "Chek rad etildi"
  );
});

module.exports = {
  uploadMiddleware,
  uploadOrderReceipt,
  downloadReceipt,
  receiptLink,
  approveReceipt,
  rejectReceipt,
  serializeReceipt,
  latestReceipt,
  RECEIPT_REJECT_REASONS,
};
