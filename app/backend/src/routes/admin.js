const express = require("express");
const {
  listBranches,
  createBranch,
  updateBranch,
  clearLekkoKey,
  toggleBranch,
  deleteBranch,
  archiveBranch,
  unarchiveBranch,
} = require("../controllers/adminBranchController");
const {
  listPharmacists,
  createPharmacist,
  updatePharmacist,
  deletePharmacist,
  setStaffStatus,
} = require("../controllers/adminUserController");
const { getDashboard, exportReport } = require("../controllers/adminDashboardController");
const { listAudit } = require("../controllers/adminAuditController");
const { listCustomers, getCustomer, setCustomerBlock } = require("../controllers/adminCustomerController");
const { networkStock, listMovements } = require("../controllers/adminStockController");
const { listPromos, createPromo, updatePromo, setPromoActive, deletePromo } = require("../controllers/adminPromoController");
const {
  lekkoSettings,
  updateLekkoSettings,
  listLekkoLogs,
  checkLekkoKey,
  syncLekkoNow,
} = require("../controllers/adminLekkoController");
const { getAdminSettings, updateAdminSettings } = require("../controllers/shopSettingsController");
const { authenticateToken, requirePermission, requireRole } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validateRequest");
const { idParamSchema } = require("../validators/branchAdminValidator");
const {
  branchWriteSchema,
  branchPatchSchema,
  pharmacistCreateSchema,
  pharmacistPatchSchema,
  clearLekkoKeySchema,
  dashboardQuerySchema,
  reportQuerySchema,
  reportParamSchema,
  auditQuerySchema,
  archiveBranchSchema,
  staffStatusSchema,
  customerBlockSchema,
  stockNetworkQuerySchema,
  stockMovementQuerySchema,
  promoWriteSchema,
  promoActiveSchema,
  lekkoSettingsSchema,
  lekkoLogQuerySchema,
  shopSettingsSchema,
} = require("../validators/adminValidator");

const router = express.Router();
const guard = [authenticateToken, requireRole("SUPER_ADMIN")];
const view = (permission) => [authenticateToken, requirePermission(permission)];

router.get("/dashboard", ...view("dashboard.read"), validateRequest(dashboardQuerySchema, "query"), getDashboard);
router.get(
  "/reports/:kind",
  ...view("reports.read"),
  validateRequest(reportParamSchema, "params"),
  validateRequest(reportQuerySchema, "query"),
  exportReport
);

router.get("/audit", ...guard, validateRequest(auditQuerySchema, "query"), listAudit);
router.get("/branches", ...guard, listBranches);
router.post("/branches", ...guard, validateRequest(branchWriteSchema), createBranch);
router.patch(
  "/branches/:id",
  ...guard,
  validateRequest(idParamSchema, "params"),
  validateRequest(branchPatchSchema),
  updateBranch
);
router.patch("/branches/:id/toggle", ...guard, validateRequest(idParamSchema, "params"), toggleBranch);
router.delete("/branches/:id", ...guard, validateRequest(idParamSchema, "params"), deleteBranch);
router.post(
  "/branches/:id/archive",
  ...guard,
  validateRequest(idParamSchema, "params"),
  validateRequest(archiveBranchSchema),
  archiveBranch
);
router.post("/branches/:id/unarchive", ...guard, validateRequest(idParamSchema, "params"), unarchiveBranch);
router.delete(
  "/branches/:id/lekko-key",
  ...guard,
  validateRequest(idParamSchema, "params"),
  validateRequest(clearLekkoKeySchema),
  clearLekkoKey
);

router.get("/stock/network", ...guard, validateRequest(stockNetworkQuerySchema, "query"), networkStock);
router.get("/stock/movements", ...guard, validateRequest(stockMovementQuerySchema, "query"), listMovements);

router.get("/shop-settings", ...guard, getAdminSettings);
router.patch("/shop-settings", ...guard, validateRequest(shopSettingsSchema), updateAdminSettings);

router.get("/lekko/settings", ...guard, lekkoSettings);
router.patch("/lekko/settings", ...guard, validateRequest(lekkoSettingsSchema), updateLekkoSettings);
router.get("/lekko/logs", ...guard, validateRequest(lekkoLogQuerySchema, "query"), listLekkoLogs);
router.post("/lekko/:id/check", ...guard, validateRequest(idParamSchema, "params"), checkLekkoKey);
router.post("/lekko/:id/sync", ...guard, validateRequest(idParamSchema, "params"), syncLekkoNow);

router.get("/promos", ...guard, listPromos);
router.post("/promos", ...guard, validateRequest(promoWriteSchema), createPromo);
router.patch("/promos/:id", ...guard, validateRequest(idParamSchema, "params"), validateRequest(promoWriteSchema), updatePromo);
router.patch(
  "/promos/:id/active",
  ...guard,
  validateRequest(idParamSchema, "params"),
  validateRequest(promoActiveSchema),
  setPromoActive
);
router.delete("/promos/:id", ...guard, validateRequest(idParamSchema, "params"), deletePromo);

router.get("/customers", ...guard, listCustomers);
router.get("/customers/:id", ...guard, validateRequest(idParamSchema, "params"), getCustomer);
router.patch(
  "/customers/:id/block",
  ...guard,
  validateRequest(idParamSchema, "params"),
  validateRequest(customerBlockSchema),
  setCustomerBlock
);

router.get("/pharmacists", ...guard, listPharmacists);
router.post("/pharmacists", ...guard, validateRequest(pharmacistCreateSchema), createPharmacist);
router.patch(
  "/pharmacists/:id",
  ...guard,
  validateRequest(idParamSchema, "params"),
  validateRequest(pharmacistPatchSchema),
  updatePharmacist
);
router.patch(
  "/pharmacists/:id/status",
  ...guard,
  validateRequest(idParamSchema, "params"),
  validateRequest(staffStatusSchema),
  setStaffStatus
);
router.delete("/pharmacists/:id", ...guard, validateRequest(idParamSchema, "params"), deletePharmacist);

module.exports = router;
