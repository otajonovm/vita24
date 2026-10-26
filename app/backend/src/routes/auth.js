const express = require("express");
const {
  login,
  me,
  requestOtp,
  verifyOtpLogin,
  telegramWebAppLogin,
  refreshSession,
  logoutSession,
  listSessions,
  revokeSession,
  revokeAllSessions,
  setup2fa,
  enable2fa,
  disable2fa,
  changePassword,
} = require("../controllers/authController");
const { authenticateToken, requireRole } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validateRequest");
const {
  loginSchema,
  refreshSchema,
  totpCodeSchema,
  disable2faSchema,
  changePasswordSchema,
  otpRequestSchema,
  otpVerifySchema,
  telegramWebAppSchema,
} = require("../validators/authValidator");
const { idParamSchema } = require("../validators/branchAdminValidator");
const { otpRequestLimiter, otpVerifyLimiter, staffLoginLimiter, telegramWebAppLimiter } = require("../lib/rateLimit");

const router = express.Router();
const adminGuard = [authenticateToken, requireRole("SUPER_ADMIN")];

router.post("/login", staffLoginLimiter, validateRequest(loginSchema, "body"), login);
router.post("/refresh", validateRequest(refreshSchema, "body"), refreshSession);
router.post("/otp/request", otpRequestLimiter, validateRequest(otpRequestSchema, "body"), requestOtp);
router.post("/otp/verify", otpVerifyLimiter, validateRequest(otpVerifySchema, "body"), verifyOtpLogin);
router.post("/telegram-webapp", telegramWebAppLimiter, validateRequest(telegramWebAppSchema, "body"), telegramWebAppLogin);
router.get("/me", authenticateToken, me);
router.post("/change-password", authenticateToken, validateRequest(changePasswordSchema), changePassword);
router.post("/logout", authenticateToken, logoutSession);
router.get("/sessions", ...adminGuard, listSessions);
router.delete("/sessions", ...adminGuard, revokeAllSessions);
router.delete("/sessions/:id", ...adminGuard, validateRequest(idParamSchema, "params"), revokeSession);
router.post("/2fa/setup", ...adminGuard, setup2fa);
router.post("/2fa/enable", ...adminGuard, validateRequest(totpCodeSchema), enable2fa);
router.post("/2fa/disable", ...adminGuard, validateRequest(disable2faSchema), disable2fa);

module.exports = router;
