const { PrismaClient } = require("../generated/prisma");
const { DEFAULTS } = require("../src/lib/shopSettings");

const prisma = new PrismaClient();

async function main() {
  const row = await prisma.shopSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      deliveryFee: DEFAULTS.deliveryFee,
      freeDeliveryFrom: DEFAULTS.freeDeliveryFrom,
      reviewWindowMinutes: DEFAULTS.reviewWindowMinutes,
      paymentWindowMinutes: DEFAULTS.paymentWindowMinutes,
      paymeEnabled: DEFAULTS.paymeEnabled,
      clickEnabled: DEFAULTS.clickEnabled,
      cashEnabled: DEFAULTS.cashEnabled,
      pickupEnabled: DEFAULTS.pickupEnabled,
      contactPhone: DEFAULTS.contactPhone,
      contactPhoneAlt: DEFAULTS.contactPhoneAlt,
      footerAbout: DEFAULTS.footerAbout,
      footerLicensed: DEFAULTS.footerLicensed,
      footerShort: DEFAULTS.footerShort,
      messageTemplates: DEFAULTS.messageTemplates,
    },
  });
  const users = await prisma.user.count();
  console.log("shop-ok", row.id, "users", users);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
