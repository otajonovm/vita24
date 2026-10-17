const crypto = require("crypto");
const { sendError } = require("../lib/response");

function notFoundHandler(req, res) {
  return sendError(
    res,
    404,
    "NOT_FOUND",
    `Marshrut topilmadi: ${req.method} ${req.originalUrl}`
  );
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return sendError(res, 400, "FILE_TOO_LARGE", "Fayl hajmi ruxsat etilgan chegaradan oshdi");
  }

  if (err.code === "P2025") {
    return sendError(res, 404, "NOT_FOUND", "Yozuv topilmadi");
  }

  if (err.code === "P2002") {
    return sendError(res, 409, "CONFLICT", "Bu yozuv allaqachon mavjud");
  }

  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) {
    const requestId = req.id || crypto.randomUUID();
    console.error(`[${requestId}] ${req.method || ""} ${req.originalUrl || ""}`, err);
    return sendError(res, 500, "INTERNAL_ERROR", "Serverda xatolik", { requestId });
  }

  const code = err.code && typeof err.code === "string" && !err.code.startsWith("P")
    ? err.code
    : "BAD_REQUEST";

  return sendError(
    res,
    statusCode,
    code,
    err.message || "So'rov bajarilmadi",
    err.details && typeof err.details === "object" ? err.details : undefined
  );
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
