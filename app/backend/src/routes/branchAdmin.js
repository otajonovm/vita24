const express = require("express");
const {
  listBranchOrders,
  verifyPrescription,
  updateDeliveryStatus,
  undoOrderStatus,
  markCashReceived,
  markRefund,
  updatePharmacistNote,
  getBranchOrder,
  listBranchStock,
  updateBranchStock,
  bulkUpdateStock,
  listStockMovements,
  syncLekko,
  panelSummary,
  panelStats,
  shiftReport,
  setBranchOpen,
  streamEvents,
  assignCourier,
} = require("../controllers/branchAdminController");
const {
  listCouriers,
  postCourier,
  patchCourier,
  getHandovers,
  confirmHandover,
  disputeHandover,
} = require("../controllers/courierController");
const {
  authenticateToken,
  requireRole,
  requireBranchAdminWrite,
} = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validateRequest");
const {
  createCourierSchema,
  updateCourierSchema,
  assignCourierSchema,
  handoverNoteSchema,
  disputeSchema,
} = require("../validators/courierValidator");
const {
  branchIdQuerySchema,
  updateStockSchema,
  bulkStockSchema,
  verifyPrescriptionSchema,
  orderStatusSchema,
  refundSchema,
  syncLekkoSchema,
  pharmacistNoteSchema,
  branchOpenSchema,
  shiftQuerySchema,
  statsQuerySchema,
  idParamSchema,
} = require("../validators/branchAdminValidator");

const router = express.Router();

router.use(authenticateToken, requireRole("BRANCH_ADMIN", "SUPER_ADMIN"));

router.get("/events", validateRequest(branchIdQuerySchema, "query"), streamEvents);
router.get("/summary", validateRequest(branchIdQuerySchema, "query"), panelSummary);
router.get("/stats", validateRequest(statsQuerySchema, "query"), panelStats);
router.get("/shift", validateRequest(shiftQuerySchema, "query"), shiftReport);

router.get("/orders", validateRequest(branchIdQuerySchema, "query"), listBranchOrders);
router.get("/orders/:id", validateRequest(idParamSchema, "params"), getBranchOrder);
router.get("/stock", validateRequest(branchIdQuerySchema, "query"), listBranchStock);
router.get("/stock/:id/movements", validateRequest(idParamSchema, "params"), listStockMovements);

// Yozuv: faqat BRANCH_ADMIN
router.patch("/branch", requireBranchAdminWrite, validateRequest(branchOpenSchema), setBranchOpen);
router.patch(
  "/orders/:id/status",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(orderStatusSchema),
  updateDeliveryStatus
);
router.post(
  "/orders/:id/undo",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  undoOrderStatus
);
router.patch(
  "/orders/:id/cash",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  markCashReceived
);
router.patch(
  "/orders/:id/note",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(pharmacistNoteSchema),
  updatePharmacistNote
);
router.patch(
  "/orders/:id/verify-prescription",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(verifyPrescriptionSchema, "body"),
  verifyPrescription
);
router.patch(
  "/stock/bulk",
  requireBranchAdminWrite,
  validateRequest(bulkStockSchema),
  bulkUpdateStock
);
router.patch(
  "/stock/:id",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(updateStockSchema, "body"),
  updateBranchStock
);
router.post("/sync-lekko", requireBranchAdminWrite, validateRequest(syncLekkoSchema, "body"), syncLekko);

router.get("/couriers", requireBranchAdminWrite, listCouriers);
router.post("/couriers", requireBranchAdminWrite, validateRequest(createCourierSchema), postCourier);
router.patch(
  "/couriers/:id",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(updateCourierSchema),
  patchCourier
);
router.patch(
  "/orders/:id/courier",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(assignCourierSchema),
  assignCourier
);
router.get("/handovers", requireBranchAdminWrite, getHandovers);
router.post(
  "/handovers/:id/confirm",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(handoverNoteSchema),
  confirmHandover
);
router.post(
  "/handovers/:id/dispute",
  requireBranchAdminWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(disputeSchema),
  disputeHandover
);

// Pul qaytarish "bajarildi" — faqat SUPER_ADMIN (platforma egasi)
router.patch(
  "/orders/:id/refund",
  requireRole("SUPER_ADMIN"),
  validateRequest(idParamSchema, "params"),
  validateRequest(refundSchema),
  markRefund
);

module.exports = router;
