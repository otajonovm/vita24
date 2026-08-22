const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess } = require("../lib/response");

const listBranches = asyncHandler(async (_req, res) => {
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
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
      isActive: true,
    },
  });

  return sendSuccess(res, branches, "Filiallar ro'yxati");
});

module.exports = {
  listBranches,
};
