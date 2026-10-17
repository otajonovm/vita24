require("dotenv").config();
const prisma = require("../src/lib/prisma");

const STATUSES = [
  "PENDING_PRESCRIPTION",
  "WAITING_PAYMENT",
  "PAID",
  "PREPARING",
  "READY",
  "DELIVERING",
  "COMPLETED",
  "CANCELLED",
];

async function main() {
  const branch =
    (await prisma.branch.findFirst({
      where: {
        isActive: true,
        OR: [{ id: "branch-yunusobod" }, { name: { contains: "Yunusobod", mode: "insensitive" } }],
      },
    })) || (await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } }));
  if (!branch) throw new Error("Faol filial topilmadi");
  const stock = await prisma.branchStock.findFirst({
    where: { branchId: branch.id, stockCount: { gt: 0 } },
    include: { medicine: true },
  });
  if (!stock) throw new Error("Omborda dori topilmadi");

  const existing = await prisma.order.count({ where: { orderNumber: { startsWith: "TEST-" } } });
  const created = [];
  for (let index = 0; index < 60; index += 1) {
    const number = existing + index + 1;
    const status = STATUSES[index % STATUSES.length];
    const order = await prisma.order.create({
      data: {
        orderNumber: `TEST-${String(number).padStart(4, "0")}`,
        branchId: branch.id,
        status,
        customerName: `Test mijoz ${number}`,
        customerPhone: `+99890000${String(number).padStart(4, "0")}`,
        deliveryAddress: "Test manzil",
        subtotal: 10000,
        reservedUntil: new Date(Date.now() + 60 * 60 * 1000),
        items: {
          create: {
            medicineId: stock.medicineId,
            quantity: 1,
            unitPrice: stock.price,
            isPrescription: false,
          },
        },
        payment: {
          create: {
            amount: 25000,
            provider: index % 2 === 0 ? "CLICK" : "CASH",
            status: ["PAID", "PREPARING", "READY", "DELIVERING", "COMPLETED"].includes(status) ? "COMPLETED" : "PENDING",
          },
        },
      },
    });
    created.push(order.orderNumber);
  }
  console.log(`${created.length} ta test buyurtma qo'shildi: ${branch.name}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
