const fs = require("fs");
const multer = require("multer");
const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess, sendError } = require("../lib/response");
const { assertBranchAccess } = require("../middlewares/authMiddleware");
const { hasPermission } = require("../lib/permissions");
const {
  MAX_BYTES,
  extensionFor,
  savePrescriptionBuffer,
  readPrescriptionFile,
  signPrescriptionAccess,
  verifyPrescriptionSignature,
  isStorageKey,
} = require("../lib/prescriptionFiles");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!extensionFor(file.mimetype)) {
      cb(new AppError("Faqat JPG, PNG yoki PDF yuklash mumkin", 400, "INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

const uploadMiddleware = upload.single("file");

function canReadPrescription(user, prescription) {
  if (!user || !prescription) return false;
  if (user.role === "SUPER_ADMIN" || hasPermission(user.role, "prescriptions.read")) return true;
  if (user.role === "BRANCH_ADMIN") {
    return prescription.order?.branchId === user.branchId;
  }
  if (user.role === "CUSTOMER") {
    return prescription.userId === user.id || prescription.order?.customerPhone === user.phone;
  }
  return false;
}

const uploadPrescription = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Retsept fayli majburiy", 400, "FILE_REQUIRED");
  }

  const fileKey = savePrescriptionBuffer({
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    userId: req.user?.id,
  });

  return sendSuccess(
    res,
    {
      fileKey,
      fileName: req.file.originalname || "retsept",
    },
    "Retsept qabul qilindi",
    201
  );
});

const downloadPrescription = asyncHandler(async (req, res) => {
  const prescription = await prisma.prescription.findUnique({
    where: { id: req.params.id },
    include: {
      order: { select: { id: true, branchId: true, customerPhone: true, userId: true } },
    },
  });

  if (!prescription || !isStorageKey(prescription.fileUrl)) {
    throw new AppError("Retsept topilmadi", 404, "NOT_FOUND");
  }

  const signed = verifyPrescriptionSignature(req.params.id, req.query.exp, req.query.sig);
  if (!signed) {
    if (!req.user) {
      return sendError(res, 401, "UNAUTHORIZED", "Retseptni ko'rish uchun ruxsat kerak");
    }
    if (req.user.role === "BRANCH_ADMIN") {
      assertBranchAccess(req, prescription.order?.branchId);
    } else if (!canReadPrescription(req.user, prescription)) {
      throw new AppError("Bu retseptga ruxsat yo'q", 403, "FORBIDDEN");
    }
  }

  const file = readPrescriptionFile(prescription.fileUrl);
  if (!file) {
    throw new AppError("Retsept fayli topilmadi", 404, "NOT_FOUND");
  }

  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", `inline; filename="${prescription.fileName || "retsept"}"`);
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(file.path).pipe(res);
});

const prescriptionLink = asyncHandler(async (req, res) => {
  if (!req.user || (req.user.role !== "SUPER_ADMIN" && req.user.role !== "BRANCH_ADMIN" && !hasPermission(req.user.role, "prescriptions.read"))) {
    throw new AppError("Bu retseptga ruxsat yo'q", 403, "FORBIDDEN");
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id: req.params.id },
    include: { order: { select: { branchId: true } } },
  });

  if (!prescription || !isStorageKey(prescription.fileUrl)) {
    throw new AppError("Retsept topilmadi", 404, "NOT_FOUND");
  }

  if (req.user.role === "BRANCH_ADMIN") {
    assertBranchAccess(req, prescription.order?.branchId);
  }

  const signed = signPrescriptionAccess(prescription.id);
  return sendSuccess(
    res,
    { url: signed.url, expiresAt: new Date(signed.exp).toISOString() },
    "Retsept havolasi"
  );
});

function prescriptionView(prescription) {
  if (!prescription || !isStorageKey(prescription.fileUrl)) return null;
  const signed = signPrescriptionAccess(prescription.id);
  return signed.url;
}

module.exports = {
  uploadMiddleware,
  uploadPrescription,
  downloadPrescription,
  prescriptionLink,
  prescriptionView,
  canReadPrescription,
};
