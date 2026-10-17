const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess } = require("../lib/response");
const { formatWorkingHours } = require("../lib/branchProfile");

const listBranches = asyncHandler(async (_req, res) => {
  const branches = await prisma.branch.findMany({
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
    },
  });

  return sendSuccess(
    res,
    branches.map((branch) => ({ ...branch, workingHours: formatWorkingHours(branch.workingHours) })),
    "Filiallar ro'yxati"
  );
});

module.exports = {
  listBranches,
};
