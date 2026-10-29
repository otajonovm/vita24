const express = require("express");
const { z } = require("zod");
const {
  deliver,
  fail,
  handover,
  listOrders,
  pickup,
  shift,
  stream,
} = require("../controllers/courierController");
const { authenticateToken, requireRole } = require("../middlewares/authMiddleware");
const { uploadDeliveryPhoto } = require("../middlewares/upload");
const { validateRequest } = require("../middlewares/validateRequest");
const { courierActionLimiter } = require("../lib/rateLimit");
const { idParamSchema } = require("../validators/branchAdminValidator");

const router = express.Router();

const scopeQuery = z.object({
  scope: z.enum(["active", "history"]).optional(),
}).strict();

const deliverSchema = z.object({
  method: z.enum(["CASH", "CARD_TERMINAL", "PREPAID"]).optional(),
  collectedAmount: z.union([z.string(), z.number()]).optional(),
  receiptGiven: z.union([z.boolean(), z.string()]).optional(),
}).passthrough();

const failSchema = z.object({
  reason: z.enum(["NO_ANSWER", "ADDRESS_NOT_FOUND", "CUSTOMER_REJECTED", "OTHER"]),
  note: z.string().trim().max(300).optional(),
});

const handoverSchema = z.object({
  amount: z.coerce.number().min(0),
  orderIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

router.use(authenticateToken, requireRole("COURIER"), courierActionLimiter);

router.get("/events", stream);
router.get("/orders", validateRequest(scopeQuery, "query"), listOrders);
router.post("/orders/:id/pickup", validateRequest(idParamSchema, "params"), pickup);
router.post(
  "/orders/:id/deliver",
  validateRequest(idParamSchema, "params"),
  uploadDeliveryPhoto,
  validateRequest(deliverSchema),
  deliver
);
router.post("/orders/:id/fail", validateRequest(idParamSchema, "params"), validateRequest(failSchema), fail);
router.get("/shift", shift);
router.post("/handover", validateRequest(handoverSchema), handover);

module.exports = router;
