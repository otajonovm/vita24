function sendSuccess(res, data, message = "Amal muvaffaqiyatli bajarildi", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}

function sendError(res, statusCode, code, message, extra) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(extra && typeof extra === "object" ? extra : {}),
    },
  });
}

class AppError extends Error {
  constructor(message, statusCode = 400, code = "BAD_REQUEST", details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = {
  sendSuccess,
  sendError,
  AppError,
  asyncHandler,
};
