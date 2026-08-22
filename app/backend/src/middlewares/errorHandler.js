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

  if (err.code === "P2025") {
    return sendError(res, 404, "NOT_FOUND", "Yozuv topilmadi");
  }

  if (err.code === "P2002") {
    return sendError(res, 409, "CONFLICT", "Bu yozuv allaqachon mavjud");
  }

  const statusCode = err.statusCode || err.status || 500;
  const code = err.code && typeof err.code === "string" && !err.code.startsWith("P")
    ? err.code
    : statusCode >= 500
      ? "INTERNAL_ERROR"
      : "BAD_REQUEST";

  return sendError(
    res,
    statusCode,
    code,
    err.message || "Ichki server xatoligi"
  );
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
