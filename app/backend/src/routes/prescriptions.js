const express = require("express");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { getJwtSecret } = require("../middlewares/authMiddleware");
const {
  uploadMiddleware,
  uploadPrescription,
  downloadPrescription,
  prescriptionLink,
} = require("../controllers/prescriptionController");
const { authenticateToken, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();

async function optionalUser(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return next();
  try {
    const payload = jwt.verify(token, getJwtSecret());
    const userId = payload.sub || payload.userId;
    if (userId) {
      req.user = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { id: true, phone: true, role: true, branchId: true, name: true },
      });
    }
  } catch {
    req.user = null;
  }
  return next();
}

function requireCustomer(req, res, next) {
  const { authenticateToken } = require("../middlewares/authMiddleware");
  return authenticateToken(req, res, () => requireRole("CUSTOMER")(req, res, next));
}

router.post("/upload", requireCustomer, uploadMiddleware, uploadPrescription);
router.get(
  "/:id/link",
  authenticateToken,
  requireRole("SUPER_ADMIN", "BRANCH_ADMIN", "MANAGER"),
  prescriptionLink
);
router.get("/:id/file", optionalUser, downloadPrescription);

module.exports = router;
