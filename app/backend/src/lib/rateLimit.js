const buckets = new Map();

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function phoneKey(req) {
  return String(req.body?.phone || "").replace(/\D/g, "") || "none";
}

function take(key, limit, windowMs) {
  const now = Date.now();
  const current = buckets.get(key);
  const bucket = !current || now >= current.resetAt ? { count: 0, resetAt: now + windowMs } : current;
  if (bucket.count >= limit) {
    buckets.set(key, bucket);
    return { limited: true, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return { limited: false, retryAfter: 0 };
}

function resetKey(key) {
  buckets.delete(key);
}

function resetPrefix(prefix) {
  for (const key of buckets.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) buckets.delete(key);
  }
}

function resetOtpVerify(phone) {
  resetPrefix(`otp-verify:${String(phone || "").replace(/\D/g, "")}`);
}

function limitRequests({ key, limit, windowMs, resetOnSuccess = false }) {
  return (req, res, next) => {
    const id = key(req);
    const result = take(id, limit, windowMs);
    if (result.limited) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT",
          message: "Juda ko'p urinish. Biroz kuting.",
          retryAfter: result.retryAfter,
        },
      });
    }
    if (resetOnSuccess) {
      res.on("finish", () => {
        if (res.statusCode < 400) resetKey(id);
      });
    }
    return next();
  };
}

const otpRequestLimiter = limitRequests({
  key: (req) => `otp-request:${phoneKey(req)}:${clientIp(req)}`,
  limit: 3,
  windowMs: 10 * 60 * 1000,
});

const otpVerifyLimiter = limitRequests({
  key: (req) => `otp-verify:${phoneKey(req)}:${clientIp(req)}`,
  limit: 5,
  windowMs: 15 * 60 * 1000,
  resetOnSuccess: true,
});

const STAFF_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const promoCheckLimiter = limitRequests({
  key: (req) => `promo:${req.user?.id || "none"}:${clientIp(req)}`,
  limit: 20,
  windowMs: 10 * 60 * 1000,
});

const telegramWebAppLimiter = limitRequests({
  key: (req) => `tg-webapp:${clientIp(req)}`,
  limit: 10,
  windowMs: 10 * 60 * 1000,
});

function staffLoginPhoneId(req) {
  return `staff-login:phone:${phoneKey(req)}`;
}

function staffLoginIpId(req) {
  return `staff-login:ip:${clientIp(req)}`;
}

function staffLoginLimiter(req, res, next) {
  const phoneResult = take(staffLoginPhoneId(req), 10, STAFF_LOGIN_WINDOW_MS);
  if (phoneResult.limited) {
    res.set("Retry-After", String(phoneResult.retryAfter));
    return res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT",
        message: "Juda ko'p urinish. Biroz kuting.",
        retryAfter: phoneResult.retryAfter,
      },
    });
  }

  const ipResult = take(staffLoginIpId(req), 30, STAFF_LOGIN_WINDOW_MS);
  if (ipResult.limited) {
    res.set("Retry-After", String(ipResult.retryAfter));
    return res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT",
        message: "Juda ko'p urinish. Biroz kuting.",
        retryAfter: ipResult.retryAfter,
      },
    });
  }

  return next();
}

function clearStaffLoginLimits(req) {
  resetKey(staffLoginPhoneId(req));
  resetKey(staffLoginIpId(req));
}

module.exports = {
  buckets,
  take,
  resetKey,
  resetOtpVerify,
  clientIp,
  phoneKey,
  otpRequestLimiter,
  otpVerifyLimiter,
  staffLoginLimiter,
  clearStaffLoginLimits,
  promoCheckLimiter,
  telegramWebAppLimiter,
};
