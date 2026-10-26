const express = require("express");
const {
  getSearchAdmin,
  createSynonym,
  updateSynonym,
  deleteSynonym,
} = require("../controllers/searchController");
const { authenticateToken, requireRole } = require("../middlewares/authMiddleware");
const { validateRequest } = require("../middlewares/validateRequest");
const { idParamSchema } = require("../validators/branchAdminValidator");
const { synonymSchema } = require("../validators/searchValidator");

const router = express.Router();

router.use(authenticateToken, requireRole("SUPER_ADMIN"));
router.get("/", getSearchAdmin);
router.post("/synonyms", validateRequest(synonymSchema), createSynonym);
router.patch(
  "/synonyms/:id",
  validateRequest(idParamSchema, "params"),
  validateRequest(synonymSchema),
  updateSynonym
);
router.delete("/synonyms/:id", validateRequest(idParamSchema, "params"), deleteSynonym);

module.exports = router;
