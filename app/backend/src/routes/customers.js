const express = require("express");
const {
  getProfile,
  updateProfile,
  getCustomerOrders,
  getCustomerPrescriptions,
  getAddress,
  saveAddress,
  listNotifications,
  markNotificationsRead,
} = require("../controllers/customerController");

const { authenticateToken, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(authenticateToken, requireRole("CUSTOMER"));

router.get("/notifications", listNotifications);
router.post("/notifications/read", markNotificationsRead);
router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.get("/orders", getCustomerOrders);
router.get("/prescriptions", getCustomerPrescriptions);
router.get("/address", getAddress);
router.put("/address", saveAddress);

module.exports = router;
