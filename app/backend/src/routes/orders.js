const express = require("express");
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
const { authenticateToken, requireRole } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validateRequest");
const { createOrderSchema, updateOrderStatusSchema, listOrdersQuerySchema, promoCheckSchema } = require("../validators/orderValidator");
const { promoCheckLimiter } = require("../lib/rateLimit");
const { idParamSchema } = require("../validators/branchAdminValidator");
const { z } = require("zod");

const router = express.Router();

const adminNoteSchema = z.object({
  adminNote: z.string().max(2000).optional().default(""),
});

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
  "/:id/mock-pay",
  requireRole("CUSTOMER"),
  validateRequest(idParamSchema, "params"),
  mockPay
);

module.exports = router;
