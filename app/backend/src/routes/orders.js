const express = require("express");
const {
  createOrder,
  listOrders,
  getOrderById,
  updateOrderStatus,
  mockPay,
} = require("../controllers/orderController");

const router = express.Router();

router.post("/", createOrder);
router.get("/", listOrders);
router.get("/:id", getOrderById);
router.patch("/:id/status", updateOrderStatus);
router.post("/:id/mock-pay", mockPay);

module.exports = router;
