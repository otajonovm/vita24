require("dotenv").config();
const { PrismaClient } = require("../generated/prisma");
const bcrypt = require("bcryptjs");

const phone = "+998901000001";
const password = "Admin123!";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, phone: true, role: true, status: true, deletedAt: true },
  });
  console.log(
    "user",
    user
      ? { id: user.id, role: user.role, status: user.status, deleted: Boolean(user.deletedAt) }
      : null
  );

  const passwordHash = await bcrypt.hash(password, 10);
  if (!user) {
    const created = await prisma.user.create({
      data: {
        name: "Vita24 Super Admin",
        phone,
        passwordHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    });
    console.log("created", created.id);
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        deletedAt: null,
        mustChangePassword: false,
      },
    });
    console.log("password-reset-ok");
  }
  console.log(`login ${phone} / ${password}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
