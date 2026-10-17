/**
 * SQLite (prisma/dev.db) -> PostgreSQL, FK tartibida, bitta tranzaksiyada.
 *
 *   npm run db:up
 *   npx prisma migrate deploy
 *   npm run db:import-sqlite
 *
 * Mavjud PostgreSQL yozuvlarini almashtirish: node scripts/migrateSqliteToPg.js --replace
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { DatabaseSync } = require("node:sqlite");
const { PrismaClient } = require("../generated/prisma");

const BATCH_SIZE = 500;
const DEFAULT_POSTGRES_URL =
  "postgresql://vita24:vita24@localhost:5432/vita24_db?schema=public";

const ROLES = new Set(["CUSTOMER", "BRANCH_ADMIN", "SUPER_ADMIN"]);
const ORDER_STATUSES = new Set([
  "PENDING_PRESCRIPTION",
  "PENDING_BRANCH",
  "WAITING_PAYMENT",
  "PAID",
  "DELIVERING",
  "COMPLETED",
  "CANCELLED",
]);
const PRESCRIPTION_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const PAYMENT_STATUSES = new Set(["PENDING", "COMPLETED", "FAILED"]);

const TABLE_ORDER = [
  "Branch",
  "Category",
  "User",
  "Medicine",
  "BranchStock",
  "Order",
  "OrderItem",
  "Prescription",
  "PaymentTransaction",
];

function resolvePostgresUrl() {
  const explicit = String(process.env.POSTGRES_URL || "").trim();
  if (explicit) return explicit.replace(/^["']|["']$/g, "");

  const current = String(process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
  if (current.startsWith("postgresql://") || current.startsWith("postgres://")) {
    return current;
  }

  return DEFAULT_POSTGRES_URL;
}

function maskUrl(url) {
  return url.replace(/\/\/([^:/]+):([^@]+)@/, "//$1:***@");
}

function requiredText(value, field) {
  if (value == null || String(value).trim() === "") {
    throw new Error(`${field} bo'sh`);
  }
  return String(value);
}

function toText(value) {
  if (value == null) return null;
  return String(value);
}

function toInt(value, field) {
  if (value == null || value === "") return null;
  const num = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isInteger(num)) {
    throw new Error(`${field} butun son emas: ${value}`);
  }
  return num;
}

function requiredInt(value, field) {
  const num = toInt(value, field);
  if (num == null) throw new Error(`${field} bo'sh`);
  return num;
}

function toFloat(value, field) {
  if (value == null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${field} son emas: ${value}`);
  }
  return num;
}

function toBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" || typeof value === "bigint") return Number(value) !== 0;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "t", "yes"].includes(text)) return true;
  if (["0", "false", "f", "no"].includes(text)) return false;
  throw new Error(`Boolean noto'g'ri: ${value}`);
}

function toDate(value, field) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value;

  if (typeof value === "number" || typeof value === "bigint") {
    const raw = Number(value);
    const ms = Math.abs(raw) < 1e12 ? raw * 1000 : raw;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${field} sana noto'g'ri: ${value}`);
    }
    return date;
  }

  const text = String(value).trim();
  if (/^\d+$/.test(text)) return toDate(Number(text), field);

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} sana noto'g'ri: ${value}`);
  }
  return date;
}

function requiredDate(value, field, fallback) {
  return toDate(value, field) || toDate(fallback, field) || new Date();
}

function toDecimal(value, field) {
  if (value == null || value === "") return "0.00";
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${field} decimal emas: ${value}`);
  }
  const text = num.toFixed(2);
  const digits = text.replace("-", "").replace(".", "");
  if (digits.length > 12) {
    throw new Error(`${field} Decimal(12,2) sig'maydi: ${text}`);
  }
  return text;
}

function toEnum(value, allowed, field) {
  const text = String(value || "").trim();
  if (!allowed.has(text)) {
    throw new Error(`${field} qiymati yaroqsiz: ${value}`);
  }
  return text;
}

function assertUnique(rows, field, label) {
  const seen = new Set();
  for (const row of rows) {
    const value = row[field];
    if (value == null || value === "") continue;
    const key = String(value);
    if (seen.has(key)) {
      throw new Error(`${label}.${field} takrorlangan: ${key}`);
    }
    seen.add(key);
  }
}

function assertCompositeUnique(rows, fields, label) {
  const seen = new Set();
  for (const row of rows) {
    const key = fields.map((field) => String(row[field])).join("|");
    if (seen.has(key)) {
      throw new Error(`${label} takrorlangan: ${key}`);
    }
    seen.add(key);
  }
}

function readTable(db, table) {
  return db.prepare(`SELECT * FROM "${table}"`).all();
}

function mapBranch(row) {
  return {
    id: requiredText(row.id, "Branch.id"),
    name: requiredText(row.name, "Branch.name"),
    slug: requiredText(row.slug, "Branch.slug"),
    address: requiredText(row.address, "Branch.address"),
    phone: requiredText(row.phone, "Branch.phone"),
    city: requiredText(row.city, "Branch.city"),
    district: requiredText(row.district, "Branch.district"),
    workingHours: requiredText(row.workingHours, "Branch.workingHours"),
    isActive: toBool(row.isActive, true),
    lekkoApiKey: toText(row.lekkoApiKey),
    lekkoDrugStoreId: toInt(row.lekkoDrugStoreId, "Branch.lekkoDrugStoreId"),
    lastSyncedAt: toDate(row.lastSyncedAt, "Branch.lastSyncedAt"),
    createdAt: requiredDate(row.createdAt, "Branch.createdAt"),
    updatedAt: requiredDate(row.updatedAt, "Branch.updatedAt", row.createdAt),
  };
}

function mapCategory(row) {
  return {
    id: requiredText(row.id, "Category.id"),
    name: requiredText(row.name, "Category.name"),
    slug: requiredText(row.slug, "Category.slug"),
    icon: requiredText(row.icon, "Category.icon"),
    sortOrder: toInt(row.sortOrder, "Category.sortOrder") ?? 0,
  };
}

function mapUser(row) {
  return {
    id: requiredText(row.id, "User.id"),
    name: requiredText(row.name, "User.name"),
    phone: requiredText(row.phone, "User.phone"),
    email: toText(row.email),
    passwordHash: requiredText(row.passwordHash, "User.passwordHash"),
    role: toEnum(row.role, ROLES, "User.role"),
    branchId: toText(row.branchId),
    lastStreet: toText(row.lastStreet),
    lastApartment: toText(row.lastApartment),
    lastFloor: toText(row.lastFloor),
    lastIntercom: toText(row.lastIntercom),
    lastLat: toFloat(row.lastLat, "User.lastLat"),
    lastLng: toFloat(row.lastLng, "User.lastLng"),
    additionalAddresses: toText(row.additionalAddresses),
    createdAt: requiredDate(row.createdAt, "User.createdAt"),
    updatedAt: requiredDate(row.updatedAt, "User.updatedAt", row.createdAt),
  };
}

function mapMedicine(row) {
  return {
    id: requiredText(row.id, "Medicine.id"),
    name: requiredText(row.name, "Medicine.name"),
    slug: requiredText(row.slug, "Medicine.slug"),
    description: row.description == null ? "" : String(row.description),
    manufacturer: requiredText(row.manufacturer, "Medicine.manufacturer"),
    dosageForm: requiredText(row.dosageForm, "Medicine.dosageForm"),
    isPrescription: toBool(row.isPrescription, false),
    showOnHome: toBool(row.showOnHome, false),
    imageEmoji: row.imageEmoji == null ? "-" : String(row.imageEmoji),
    imageUrl: toText(row.imageUrl),
    externalApiId: toInt(row.externalApiId, "Medicine.externalApiId"),
    barcode: toText(row.barcode),
    ikpuCode: toText(row.ikpuCode),
    quantityInPack:
      row.quantityInPack == null || row.quantityInPack === ""
        ? null
        : toInt(row.quantityInPack, "Medicine.quantityInPack"),
    categoryId: requiredText(row.categoryId, "Medicine.categoryId"),
    createdAt: requiredDate(row.createdAt, "Medicine.createdAt"),
    updatedAt: requiredDate(row.updatedAt, "Medicine.updatedAt", row.createdAt),
  };
}

function mapBranchStock(row) {
  return {
    id: requiredText(row.id, "BranchStock.id"),
    branchId: requiredText(row.branchId, "BranchStock.branchId"),
    medicineId: requiredText(row.medicineId, "BranchStock.medicineId"),
    price: toDecimal(row.price, "BranchStock.price"),
    stockCount: toInt(row.stockCount, "BranchStock.stockCount") ?? 0,
    reservedCount: toInt(row.reservedCount, "BranchStock.reservedCount") ?? 0,
    updatedAt: requiredDate(row.updatedAt, "BranchStock.updatedAt"),
  };
}

function mapOrder(row) {
  return {
    id: requiredText(row.id, "Order.id"),
    orderNumber: requiredText(row.orderNumber, "Order.orderNumber"),
    userId: toText(row.userId),
    branchId: requiredText(row.branchId, "Order.branchId"),
    status: toEnum(row.status, ORDER_STATUSES, "Order.status"),
    customerName: requiredText(row.customerName, "Order.customerName"),
    customerPhone: requiredText(row.customerPhone, "Order.customerPhone"),
    deliveryAddress: requiredText(row.deliveryAddress, "Order.deliveryAddress"),
    deliveryLat: toFloat(row.deliveryLat, "Order.deliveryLat"),
    deliveryLng: toFloat(row.deliveryLng, "Order.deliveryLng"),
    notes: toText(row.notes),
    subtotal: toDecimal(row.subtotal, "Order.subtotal"),
    reservedUntil: requiredDate(row.reservedUntil, "Order.reservedUntil"),
    createdAt: requiredDate(row.createdAt, "Order.createdAt"),
    updatedAt: requiredDate(row.updatedAt, "Order.updatedAt", row.createdAt),
  };
}

function mapOrderItem(row) {
  return {
    id: requiredText(row.id, "OrderItem.id"),
    orderId: requiredText(row.orderId, "OrderItem.orderId"),
    medicineId: requiredText(row.medicineId, "OrderItem.medicineId"),
    quantity: requiredInt(row.quantity, "OrderItem.quantity"),
    unitPrice: toDecimal(row.unitPrice, "OrderItem.unitPrice"),
    isPrescription: toBool(row.isPrescription, false),
  };
}

function mapPrescription(row) {
  return {
    id: requiredText(row.id, "Prescription.id"),
    userId: toText(row.userId),
    orderId: requiredText(row.orderId, "Prescription.orderId"),
    fileUrl: requiredText(row.fileUrl, "Prescription.fileUrl"),
    fileName: requiredText(row.fileName, "Prescription.fileName"),
    status: toEnum(row.status, PRESCRIPTION_STATUSES, "Prescription.status"),
    rejectNote: toText(row.rejectNote),
    createdAt: requiredDate(row.createdAt, "Prescription.createdAt"),
  };
}

function mapPayment(row) {
  return {
    id: requiredText(row.id, "PaymentTransaction.id"),
    orderId: requiredText(row.orderId, "PaymentTransaction.orderId"),
    amount: toDecimal(row.amount, "PaymentTransaction.amount"),
    provider: row.provider == null || row.provider === "" ? "MOCK" : String(row.provider),
    status: toEnum(row.status, PAYMENT_STATUSES, "PaymentTransaction.status"),
    externalId: toText(row.externalId),
    paidAt: toDate(row.paidAt, "PaymentTransaction.paidAt"),
    createdAt: requiredDate(row.createdAt, "PaymentTransaction.createdAt"),
    updatedAt: requiredDate(row.updatedAt, "PaymentTransaction.updatedAt", row.createdAt),
  };
}

async function copyInBatches(label, rows, writeBatch) {
  let copied = 0;
  if (!rows.length) {
    console.log(`[migrate] ${label}: 0/0`);
    return 0;
  }

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    await writeBatch(batch);
    copied += batch.length;
    console.log(`[migrate] ${label}: ${copied}/${rows.length}`);
  }

  return copied;
}

async function clearTarget(tx) {
  await tx.paymentTransaction.deleteMany();
  await tx.prescription.deleteMany();
  await tx.orderItem.deleteMany();
  await tx.order.deleteMany();
  await tx.branchStock.deleteMany();
  await tx.medicine.deleteMany();
  await tx.user.deleteMany();
  await tx.category.deleteMany();
  await tx.branch.deleteMany();
}

async function main() {
  const replace = process.argv.includes("--replace");
  const sqlitePath = path.resolve(
    process.env.SQLITE_PATH || path.join(__dirname, "..", "prisma", "dev.db")
  );
  const postgresUrl = resolvePostgresUrl();
  process.env.DATABASE_URL = postgresUrl;

  console.log(`[migrate] manba: ${sqlitePath}`);
  console.log(`[migrate] qabul: ${maskUrl(postgresUrl)}`);

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const source = {
    Branch: readTable(sqlite, "Branch").map(mapBranch),
    Category: readTable(sqlite, "Category").map(mapCategory),
    User: readTable(sqlite, "User").map(mapUser),
    Medicine: readTable(sqlite, "Medicine").map(mapMedicine),
    BranchStock: readTable(sqlite, "BranchStock").map(mapBranchStock),
    Order: readTable(sqlite, "Order").map(mapOrder),
    OrderItem: readTable(sqlite, "OrderItem").map(mapOrderItem),
    Prescription: readTable(sqlite, "Prescription").map(mapPrescription),
    PaymentTransaction: readTable(sqlite, "PaymentTransaction").map(mapPayment),
  };
  sqlite.close();

  assertUnique(source.Branch, "id", "Branch");
  assertUnique(source.Branch, "slug", "Branch");
  assertUnique(source.Category, "id", "Category");
  assertUnique(source.Category, "slug", "Category");
  assertUnique(source.User, "id", "User");
  assertUnique(source.User, "phone", "User");
  assertUnique(source.User, "email", "User");
  assertUnique(source.Medicine, "id", "Medicine");
  assertUnique(source.Medicine, "slug", "Medicine");
  assertUnique(source.Medicine, "externalApiId", "Medicine");
  assertCompositeUnique(source.BranchStock, ["branchId", "medicineId"], "BranchStock");
  assertUnique(source.Order, "id", "Order");
  assertUnique(source.Order, "orderNumber", "Order");
  assertUnique(source.OrderItem, "id", "OrderItem");
  assertUnique(source.Prescription, "orderId", "Prescription");
  assertUnique(source.PaymentTransaction, "orderId", "PaymentTransaction");

  const branchById = new Map(source.Branch.map((row) => [row.id, row]));
  const yunusobod = source.Branch.find((row) => row.slug === "yunusobod");
  const sourceSummary = {
    branches: source.Branch.length,
    categories: source.Category.length,
    users: source.User.length,
    medicines: source.Medicine.length,
    lekkoMedicines: source.Medicine.filter((row) => row.externalApiId != null).length,
    seedMedicines: source.Medicine.filter((row) => row.externalApiId == null).length,
    stocks: source.BranchStock.length,
    yunusobodStocks: yunusobod
      ? source.BranchStock.filter((row) => row.branchId === yunusobod.id).length
      : 0,
    orders: source.Order.length,
    orderItems: source.OrderItem.length,
    prescriptions: source.Prescription.length,
    payments: source.PaymentTransaction.length,
    branchesWithLekkoKey: source.Branch.filter(
      (row) => row.lekkoApiKey && String(row.lekkoApiKey).trim()
    ).length,
  };

  console.log("[migrate] SQLite hisobot:", JSON.stringify(sourceSummary));

  for (const user of source.User) {
    if (user.branchId && !branchById.has(user.branchId)) {
      throw new Error(`User ${user.id} filialga bog'lanmagan: ${user.branchId}`);
    }
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$queryRaw`SELECT 1`;

    const existingMedicines = await prisma.medicine.count();
    const existingBranches = await prisma.branch.count();
    if ((existingMedicines > 0 || existingBranches > 0) && !replace) {
      throw new Error(
        `PostgreSQL allaqachon ma'lumot saqlaydi (Branch=${existingBranches}, Medicine=${existingMedicines}). Qayta ko'chirish uchun --replace bering.`
      );
    }

    const copied = await prisma.$transaction(
      async (tx) => {
        if (replace) {
          console.log("[migrate] mavjud PostgreSQL yozuvlari tozalanmoqda");
          await clearTarget(tx);
        }

        const counts = {};
        counts.Branch = await copyInBatches("Branch", source.Branch, (batch) =>
          tx.branch.createMany({ data: batch })
        );
        counts.Category = await copyInBatches("Category", source.Category, (batch) =>
          tx.category.createMany({ data: batch })
        );
        counts.User = await copyInBatches("User", source.User, (batch) =>
          tx.user.createMany({ data: batch })
        );
        counts.Medicine = await copyInBatches("Medicine", source.Medicine, (batch) =>
          tx.medicine.createMany({ data: batch })
        );
        counts.BranchStock = await copyInBatches("BranchStock", source.BranchStock, (batch) =>
          tx.branchStock.createMany({ data: batch })
        );
        counts.Order = await copyInBatches("Order", source.Order, (batch) =>
          tx.order.createMany({ data: batch })
        );
        counts.OrderItem = await copyInBatches("OrderItem", source.OrderItem, (batch) =>
          tx.orderItem.createMany({ data: batch })
        );
        counts.Prescription = await copyInBatches("Prescription", source.Prescription, (batch) =>
          tx.prescription.createMany({ data: batch })
        );
        counts.PaymentTransaction = await copyInBatches(
          "PaymentTransaction",
          source.PaymentTransaction,
          (batch) => tx.paymentTransaction.createMany({ data: batch })
        );
        return counts;
      },
      { maxWait: 20_000, timeout: 600_000 }
    );

    const target = {
      branches: await prisma.branch.count(),
      categories: await prisma.category.count(),
      users: await prisma.user.count(),
      medicines: await prisma.medicine.count(),
      lekkoMedicines: await prisma.medicine.count({ where: { externalApiId: { not: null } } }),
      seedMedicines: await prisma.medicine.count({ where: { externalApiId: null } }),
      stocks: await prisma.branchStock.count(),
      yunusobodStocks: await prisma.branchStock.count({
        where: { branch: { slug: "yunusobod" } },
      }),
      orders: await prisma.order.count(),
      orderItems: await prisma.orderItem.count(),
      prescriptions: await prisma.prescription.count(),
      payments: await prisma.paymentTransaction.count(),
    };

    console.log("[migrate] COMMIT. Ko'chirildi:", JSON.stringify(copied));
    console.log("[migrate] PostgreSQL hisobot:", JSON.stringify(target));

    const checks = [
      ["Branch", sourceSummary.branches, target.branches],
      ["Category", sourceSummary.categories, target.categories],
      ["User", sourceSummary.users, target.users],
      ["Medicine", sourceSummary.medicines, target.medicines],
      ["LEKKO Medicine", sourceSummary.lekkoMedicines, target.lekkoMedicines],
      ["Seed Medicine", sourceSummary.seedMedicines, target.seedMedicines],
      ["BranchStock", sourceSummary.stocks, target.stocks],
      ["Yunusobod BranchStock", sourceSummary.yunusobodStocks, target.yunusobodStocks],
      ["Order", sourceSummary.orders, target.orders],
      ["OrderItem", sourceSummary.orderItems, target.orderItems],
      ["Prescription", sourceSummary.prescriptions, target.prescriptions],
      ["PaymentTransaction", sourceSummary.payments, target.payments],
    ];

    const mismatched = checks.filter(([, from, to]) => from !== to);
    if (mismatched.length) {
      for (const [label, from, to] of mismatched) {
        console.error(`[migrate] FARQ ${label}: sqlite=${from} postgres=${to}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      `[migrate] tayyor. Jadval tartibi: ${TABLE_ORDER.join(" -> ")}. Barcha yozuvlar mos.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[migrate] BEKOR QILINDI:", error.message);
  process.exit(1);
});
