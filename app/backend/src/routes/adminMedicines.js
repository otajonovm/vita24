const express = require("express");
const { z } = require("zod");
const { updateMedicineImage, setMedicineHome, listShowcase, reorderShowcase } = require("../controllers/adminMedicineController");
const {
  listCatalog,
  createMedicine,
  updateMedicine,
  setMedicineActive,
  listAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  previewImport,
  confirmImport,
  exportCatalog,
  setMedicinePrescription,
  setMedicinePrescriptionBulk,
} = require("../controllers/adminCatalogController");
const { authenticateToken, requireRole } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validateRequest");
const { uploadMedicineImage, uploadCatalogFile } = require("../middlewares/upload");
const { idParamSchema } = require("../validators/branchAdminValidator");
const {
  medicineWriteSchema,
  medicineActiveSchema,
  medicineRxSchema,
  medicineRxBulkSchema,
  categoryWriteSchema,
  importConfirmSchema,
  showcaseQuerySchema,
  showcaseOrderSchema,
} = require("../validators/adminValidator");
const { pageQuery, limitQuery } = require("../validators/queryFields");

const showOnHomeSchema = z
  .object({
    showOnHome: z.boolean({ required_error: "showOnHome true yoki false bo'lishi kerak" }),
  })
  .strict();

const catalogQuerySchema = z
  .object({
    search: z.string().trim().max(80).optional(),
    categoryId: z.string().trim().optional(),
    active: z.enum(["all", "active", "inactive"]).optional(),
    prescription: z.enum(["all", "yes", "no", "review"]).optional(),
    rxSource: z.enum(["LEKKO", "RULE", "MANUAL"]).optional(),
    page: pageQuery,
    limit: limitQuery,
  })
  .strict();

const exportQuerySchema = z
  .object({
    format: z.enum(["csv", "xlsx"]).optional(),
  })
  .strict();

const router = express.Router();
const admin = requireRole("SUPER_ADMIN");

router.use(authenticateToken, requireRole("BRANCH_ADMIN", "SUPER_ADMIN"));

router.get("/categories", admin, listAdminCategories);
router.post("/categories", admin, validateRequest(categoryWriteSchema), createCategory);
router.patch("/categories/:id", admin, validateRequest(idParamSchema, "params"), validateRequest(categoryWriteSchema.partial()), updateCategory);
router.delete("/categories/:id", admin, validateRequest(idParamSchema, "params"), deleteCategory);

router.get("/", admin, validateRequest(catalogQuerySchema, "query"), listCatalog);
router.post("/", admin, validateRequest(medicineWriteSchema), createMedicine);
router.post("/import/preview", admin, uploadCatalogFile, previewImport);
router.post("/import/confirm", admin, validateRequest(importConfirmSchema), confirmImport);
router.get("/export", admin, validateRequest(exportQuerySchema, "query"), exportCatalog);
router.post("/rx/bulk", admin, validateRequest(medicineRxBulkSchema), setMedicinePrescriptionBulk);
router.get("/home", admin, validateRequest(showcaseQuerySchema, "query"), listShowcase);
router.patch("/home/order", admin, validateRequest(showcaseOrderSchema), reorderShowcase);

router.patch(
  "/:id/active",
  admin,
  validateRequest(idParamSchema, "params"),
  validateRequest(medicineActiveSchema),
  setMedicineActive
);
router.patch("/:id", admin, validateRequest(idParamSchema, "params"), validateRequest(medicineWriteSchema), updateMedicine);
router.patch(
  "/:id/rx",
  admin,
  validateRequest(idParamSchema, "params"),
  validateRequest(medicineRxSchema),
  setMedicinePrescription
);

router.patch(
  "/:id/home",
  admin,
  validateRequest(idParamSchema, "params"),
  validateRequest(showOnHomeSchema),
  setMedicineHome
);

router.patch(
  "/:id/image",
  admin,
  validateRequest(idParamSchema, "params"),
  uploadMedicineImage,
  updateMedicineImage
);

module.exports = router;
