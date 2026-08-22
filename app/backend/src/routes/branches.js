const express = require("express");
const { listBranches } = require("../controllers/branchController");

const router = express.Router();

router.get("/", listBranches);

module.exports = router;
