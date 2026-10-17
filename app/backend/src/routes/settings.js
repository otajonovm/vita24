const express = require("express");
const { publicSettings } = require("../controllers/shopSettingsController");

const router = express.Router();
router.get("/", publicSettings);

module.exports = router;
