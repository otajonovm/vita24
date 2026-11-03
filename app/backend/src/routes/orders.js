const express = require("express");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const {
  createOrder,
  checkPromo,
  listOrders,
  getOrderById,
  updateOrderStatus,
  updateAdminNote,
  mockPay,
  replaceOrderPrescription,
} = require("../controllers/orderController");
const {
  uploadMiddleware,
  uploadOrderReceipt,
  downloadReceipt,
  receiptLink,
} = require("../controllers/receiptController");
const { authenticateToken, requireRole, getJwtSecret } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validateRequest");
const { createOrderSchema, updateOrderStatusSchema, listOrdersQuerySchema, promoCheckSchema } = require("../validators/orderValidator");
const { promoCheckLimiter } = require("../lib/rateLimit");
const { idParamSchema } = require("../validators/branchAdminValidator");
const { z } = require("zod");

const router = express.Router();

const adminNoteSchema = z.object({
  adminNote: z.string().max(2000).optional().default(""),
});

async function optionalUser(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return next();
  try {
    const payload = jwt.verify(token, getJwtSecret());
    const userId = payload.sub || payload.userId;
    if (userId) {
      req.user = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { id: true, phone: true, role: true, branchId: true, name: true },
      });
    }
  } catch {
    req.user = null;
  }
  return next();
}

router.get("/receipts/:receiptId/file", optionalUser, downloadReceipt);
router.get(
  "/receipts/:receiptId/link",
  authenticateToken,
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "MANAGER"),
  receiptLink
);

router.use(authenticateToken);

router.post("/", requireRole("CUSTOMER"), validateRequest(createOrderSchema, "body"), createOrder);
router.post("/promo", requireRole("CUSTOMER"), promoCheckLimiter, validateRequest(promoCheckSchema), checkPromo);
router.get(
  "/",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "MANAGER"),
  validateRequest(listOrdersQuerySchema, "query"),
  listOrders
);
router.get("/:id", validateRequest(idParamSchema, "params"), getOrderById);
router.patch(
  "/:id/status",
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "CUSTOMER"),
  validateRequest(idParamSchema, "params"),
  validateRequest(updateOrderStatusSchema, "body"),
  updateOrderStatus
);
router.patch(
  "/:id/admin-note",
  requireRole("SUPER_ADMIN"),
  validateRequest(idParamSchema, "params"),
  validateRequest(adminNoteSchema, "body"),
  updateAdminNote
);
router.post(
  "/:id/prescription",
  requireRole("CUSTOMER"),
  validateRequest(idParamSchema, "params"),
  replaceOrderPrescription
);
router.post(
  "/:id/receipt",
  requireRole("CUSTOMER"),
  validateRequest(idParamSchema, "params"),
  uploadMiddleware,
  uploadOrderReceipt
);
router.post(
  "/:id/mock-pay",
  requireRole("CUSTOMER"),
  validateRequest(idParamSchema, "params"),
  mockPay
);

module.exports = router;
