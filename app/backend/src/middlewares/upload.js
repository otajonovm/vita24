const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { AppError } = require("../lib/response");

const MEDICINE_UPLOAD_DIR = path.join(__dirname, "../../public/uploads/medicines");
const MEDICINE_UPLOAD_URL = "/uploads/medicines";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Extension is derived from the validated MIME type, never from the client file name.
const IMAGE_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

fs.mkdirSync(MEDICINE_UPLOAD_DIR, { recursive: true });

function safeIdSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "unknown";
}

const medicineImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDICINE_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = IMAGE_EXTENSIONS[file.mimetype];
    cb(null, `med-${safeIdSegment(req.params.id)}-${Date.now()}${ext}`);
  },
});

const medicineImageMulter = multer({
  storage: medicineImageStorage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_EXTENSIONS[file.mimetype]) {
      cb(new AppError("Faqat JPEG, PNG yoki WEBP rasm yuklash mumkin", 400, "INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

function toAppError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new AppError("Rasm hajmi 2MB dan oshmasligi kerak", 413, "FILE_TOO_LARGE");
    }
    return new AppError(`Fayl yuklashda xato: ${error.message}`, 400, "UPLOAD_ERROR");
  }
  return error;
}

/**
 * Single `image` field → req.file. Multer errors are converted to AppError
 * so the central errorHandler returns 4xx instead of 500.
 */
const catalogImportMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const ok = name.endsWith(".csv") || name.endsWith(".xlsx") || file.mimetype === "text/csv";
    if (!ok) {
      cb(new AppError("Faqat CSV yoki Excel (.xlsx) fayl", 400, "INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

function uploadCatalogFile(req, res, next) {
  catalogImportMulter.single("file")(req, res, (error) => {
    next(error ? toAppError(error) : undefined);
  });
}

function uploadMedicineImage(req, res, next) {
  medicineImageMulter.single("image")(req, res, (error) => {
    next(error ? toAppError(error) : undefined);
  });
}

function removeUploadedFile(filePath) {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
}

/**
 * Deletes a previously uploaded medicine image. Only paths inside
 * MEDICINE_UPLOAD_DIR are touched; external URLs are ignored.
 */
function removeMedicineImageByUrl(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith(`${MEDICINE_UPLOAD_URL}/`)) return;
  const fileName = path.basename(String(imageUrl));
  removeUploadedFile(path.join(MEDICINE_UPLOAD_DIR, fileName));
}

module.exports = {
  MEDICINE_UPLOAD_URL,
  MAX_IMAGE_BYTES,
  uploadMedicineImage,
  uploadCatalogFile,
  removeUploadedFile,
  removeMedicineImageByUrl,
};
