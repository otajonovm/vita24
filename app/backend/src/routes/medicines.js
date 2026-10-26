const express = require("express");
const {
  listCategories,
  listMedicines,
  getMedicineBySlug,
  cartAvailability,
} = require("../controllers/medicineController");
const { suggestMedicines, recordSearchClick } = require("../controllers/searchController");
const { validateRequest } = require("../middlewares/validateRequest");
const { listMedicinesQuerySchema } = require("../validators/medicineValidator");
const { suggestQuerySchema, searchClickSchema } = require("../validators/searchValidator");

const router = express.Router();

router.get("/categories", listCategories);
router.get("/availability", cartAvailability);
router.get("/suggest", validateRequest(suggestQuerySchema, "query"), suggestMedicines);
router.post("/search-click", validateRequest(searchClickSchema), recordSearchClick);
router.get("/", validateRequest(listMedicinesQuerySchema, "query"), listMedicines);
router.get("/:slug", getMedicineBySlug);

module.exports = router;
