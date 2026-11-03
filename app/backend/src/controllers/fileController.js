const fs = require("fs");
const path = require("path");
const prisma = require("../lib/prisma");
const { AppError, asyncHandler } = require("../lib/response");
const { PROOF_UPLOAD_DIR } = require("../middlewares/upload");

function insideProofDir(filePath) {
  const root = path.resolve(PROOF_UPLOAD_DIR);
  const resolved = path.resolve(String(filePath || ""));
  return resolved.startsWith(root + path.sep) || resolved === root;
}

const getProofFile = asyncHandler(async (req, res) => {
  const proof = await prisma.deliveryProof.findUnique({
    where: { id: req.params.id },
    include: { order: { select: { branchId: true, courierId: true } } },
  });
  if (!proof?.photoPath || !proof.order) {
    throw new AppError("Fayl topilmadi", 404, "NOT_FOUND");
  }
  const user = req.user || {};
  const allowed =
    user.role === "SUPER_ADMIN" ||
    (user.role === "COURIER" && user.id === proof.courierId) ||
    (user.role === "BRANCH_ADMIN" && user.branchId && user.branchId === proof.order.branchId);
  if (!allowed) throw new AppError("Ruxsat yo'q", 403, "FORBIDDEN");
  if (!insideProofDir(proof.photoPath) || !fs.existsSync(proof.photoPath)) {
    throw new AppError("Fayl topilmadi", 404, "NOT_FOUND");
  }
  return res.sendFile(path.resolve(proof.photoPath));
});

module.exports = { getProofFile };
