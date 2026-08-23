require("dotenv").config();

const express = require("express");
const cors = require("cors");
const prisma = require("./src/lib/prisma");
const branchRoutes = require("./src/routes/branches");
const medicineRoutes = require("./src/routes/medicines");
const orderRoutes = require("./src/routes/orders");
const { errorHandler, notFoundHandler } = require("./src/middlewares/errorHandler");
const { sendSuccess } = require("./src/lib/response");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return sendSuccess(res, { status: "ok", database: "connected" }, "API ishlayapti");
  } catch {
    return sendSuccess(res, { status: "ok", database: "disconnected" }, "API ishlayapti");
  }
});

app.use("/api/branches", branchRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/customers", require("./src/routes/customers"));

const clickController = require("./src/controllers/clickController");
app.post("/api/payments/click/prepare", clickController.prepare);
app.post("/api/payments/click/complete", clickController.complete);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Vita24 API ${PORT}-portda ishlayapti`);
});
