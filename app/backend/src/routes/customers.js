const express = require("express");
const { getAddress, saveAddress } = require("../controllers/customerController");

const router = express.Router();

router.get("/address", getAddress);
router.put("/address", saveAddress);

module.exports = router;
