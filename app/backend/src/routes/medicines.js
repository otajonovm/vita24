const express = require("express");
const {
  listCategories,
  listMedicines,
} = require("../controllers/medicineController");

const router = express.Router();

router.get("/categories", listCategories);
router.get("/", listMedicines);

module.exports = router;
