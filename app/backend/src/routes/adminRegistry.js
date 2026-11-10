const express = require("express");
const { z } = require("zod");
const { authenticateToken, requireRole } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validateRequest");
const { idParamSchema } = require("../validators/branchAdminValidator");
const {
  getStats,
  listReview,
  searchRegistry,
  confirmMatch,
  rejectMatch,
  setMatch,
  decideImage,
  bulkDecideImages,
} = require("../controllers/adminRegistryController");

const router = express.Router();
const admin = [authenticateToken, requireRole("SUPER_ADMIN")];

const reviewQuerySchema = z
  .object({
    tab: z.enum(["matches", "images", "all"]).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

const searchQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    name: z.string().trim().max(80).optional(),
  })
  .strict();

const matchBodySchema = z
  .object({
    registryDrugId: z.string().trim().min(1),
  })
  .strict();

const imageBodySchema = z
  .object({
    action: z.enum(["approve", "reject", "select-side"]),
    side: z.string().trim().optional(),
    url: z.string().trim().optional(),
  })
  .strict();

const bulkImageSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    ids: z.array(z.string().trim().min(1)).min(1).max(100),
  })
  .strict();

router.get("/stats", ...admin, getStats);
router.get("/review", ...admin, validateRequest(reviewQuerySchema, "query"), listReview);
router.get("/search", ...admin, validateRequest(searchQuerySchema, "query"), searchRegistry);
router.post(
  "/medicines/:id/match/confirm",
  ...admin,
  validateRequest(idParamSchema, "params"),
  validateRequest(matchBodySchema),
  confirmMatch
);
router.post(
  "/medicines/:id/match/reject",
  ...admin,
  validateRequest(idParamSchema, "params"),
  rejectMatch
);
router.post(
  "/medicines/:id/match",
  ...admin,
  validateRequest(idParamSchema, "params"),
  validateRequest(matchBodySchema),
  setMatch
);
router.post(
  "/medicines/:id/image",
  ...admin,
  validateRequest(idParamSchema, "params"),
  validateRequest(imageBodySchema),
  decideImage
);
router.post("/images/bulk", ...admin, validateRequest(bulkImageSchema), bulkDecideImages);

module.exports = router;
