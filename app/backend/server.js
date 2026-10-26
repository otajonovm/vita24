require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const prisma = require("./src/lib/prisma");
const { assertRuntimeSecrets, encryptSecret } = require("./src/lib/secrets");
const { dataPath } = require("./src/lib/dataDir");
const branchRoutes = require("./src/routes/branches");
const medicineRoutes = require("./src/routes/medicines");
const orderRoutes = require("./src/routes/orders");
const { errorHandler, notFoundHandler } = require("./src/middlewares/errorHandler");
const { requestId } = require("./src/middlewares/requestId");
const { applyTrustProxy } = require("./src/lib/trustProxy");
const { sendSuccess } = require("./src/lib/response");

assertRuntimeSecrets();

const app = express();
const PORT = process.env.PORT || 5000;

applyTrustProxy(app);
app.use(requestId);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/uploads", express.static(dataPath("public", "uploads")));

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return sendSuccess(res, { status: "ok", database: "connected" }, "API ishlayapti");
  } catch {
    return sendSuccess(res, { status: "ok", database: "disconnected" }, "API ishlayapti");
  }
});

app.get("/robots.txt", (_req, res) => {
  const origin = process.env.PUBLIC_SITE_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173";
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /branch-admin\nSitemap: ${origin}/sitemap.xml\n`);
});

app.get("/sitemap.xml", async (_req, res) => {
  const origin = process.env.PUBLIC_SITE_URL || process.env.CLIENT_ORIGIN || "http://localhost:5173";
  const medicines = await prisma.medicine.findMany({
    select: { slug: true, updatedAt: true },
    take: 5000,
    orderBy: { updatedAt: "desc" },
  });
  const urls = ["/", "/catalog", "/favorites", "/terms", "/privacy"]
    .map((pathName) => `<url><loc>${origin}${pathName}</loc></url>`)
    .concat(
      medicines.map(
        (item) =>
          `<url><loc>${origin}/medicine/${encodeURIComponent(item.slug)}</loc><lastmod>${item.updatedAt.toISOString()}</lastmod></url>`
      )
    );
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`);
});

app.use("/api/settings", require("./src/routes/settings"));
app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/branches", branchRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/customers", require("./src/routes/customers"));
app.use("/api/prescriptions", require("./src/routes/prescriptions"));
app.use("/api/branch-admin", require("./src/routes/branchAdmin"));
app.use("/api/admin/medicines", require("./src/routes/adminMedicines"));
app.use("/api/admin/search", require("./src/routes/adminSearch"));
app.use("/api/admin", require("./src/routes/admin"));

const clickController = require("./src/controllers/clickController");
app.post("/api/payments/click/prepare", express.urlencoded({ extended: true }), clickController.prepare);
app.post("/api/payments/click/complete", express.urlencoded({ extended: true }), clickController.complete);
app.post("/api/payments/payme", clickController.payme);

app.use(notFoundHandler);
app.use(errorHandler);

async function encryptStoredLekkoKeys() {
  const branches = await prisma.branch.findMany({
    select: { id: true, lekkoApiKey: true },
  });
  for (const branch of branches) {
    if (!branch.lekkoApiKey || String(branch.lekkoApiKey).startsWith("enc:v1:")) continue;
    await prisma.branch.update({
      where: { id: branch.id },
      data: { lekkoApiKey: encryptSecret(branch.lekkoApiKey) },
    });
  }
}

let httpServer = null;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal}`);
  const bot = require("./src/bot");
  bot.markStopping();
  Promise.resolve()
    .then(() => bot.stopBot())
    .catch((error) => console.error("[telegram] stop:", error.message))
    .finally(() => {
      if (!httpServer) {
        process.exit(0);
        return;
      }
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 8000).unref();
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

encryptStoredLekkoKeys()
  .catch((error) => {
    console.error("[secrets] LEKKO kalitlarini shifrlab bo'lmadi:", error.message);
    process.exit(1);
  })
  .then(() => require("./src/lib/shopSettings").getShopSettings())
  .catch((error) => {
    console.error("[settings] Sozlamalar o'qilmadi:", error.message);
  })
  .then(() => {
    httpServer = app.listen(PORT, () => {
      console.log(`Vita24 API ${PORT}-portda ishlayapti`);
      try {
        require("./src/workers/stockSyncWorker").startStockSyncWorker();
      } catch (error) {
        console.error("[LEKKO] Worker ishga tushmadi:", error.message);
      }
      try {
        require("./src/bot")
          .initBot()
          .catch((error) => {
            console.error("[telegram] Bot ishga tushmadi:", error.message);
          });
      } catch (error) {
        console.error("[telegram] Bot ishga tushmadi:", error.message);
      }
    });
  });
