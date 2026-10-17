const express = require("express");
const {
  listCategories,
  listMedicines,
  getMedicineBySlug,
  cartAvailability,
} = require("../controllers/medicineController");
const { validateRequest } = require("../middlewares/validateRequest");
const { listMedicinesQuerySchema } = require("../validators/medicineValidator");

const router = express.Router();

router.get("/categories", listCategories);
router.get("/availability", cartAvailability);
router.get("/", validateRequest(listMedicinesQuerySchema, "query"), listMedicines);
router.get("/:slug", getMedicineBySlug);

module.exports = router;
