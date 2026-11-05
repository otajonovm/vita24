const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess } = require("../lib/response");
const { formatWorkingHours } = require("../lib/branchProfile");
const { getShopSettings } = require("../lib/shopSettings");
const { resolveCardTransfer } = require("../lib/cardTransfer");

const listBranches = asyncHandler(async (_req, res) => {
  const [branches, shop] = await Promise.all([
    prisma.branch.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        phone: true,
        city: true,
        district: true,
        workingHours: true,
        lat: true,
        lng: true,
        deliveryRadiusKm: true,
        isActive: true,
        isOpen: true,
        cardTransferEnabled: true,
        cardTransferNumber: true,
        cardTransferHolder: true,
        cardTransferBank: true,
      },
    }),
    getShopSettings(),
  ]);

  return sendSuccess(
    res,
    branches.map((branch) => {
      const card = resolveCardTransfer(branch, shop);
      return {
        id: branch.id,
        name: branch.name,
        slug: branch.slug,
        address: branch.address,
        phone: branch.phone,
        city: branch.city,
        district: branch.district,
        workingHours: formatWorkingHours(branch.workingHours),
        lat: branch.lat,
        lng: branch.lng,
        deliveryRadiusKm: branch.deliveryRadiusKm,
        isActive: branch.isActive,
        isOpen: branch.isOpen,
        cardTransferEnabled: card.cardTransferEnabled,
      };
    }),
    "Filiallar ro'yxati"
  );
});

module.exports = {
  listBranches,
};
