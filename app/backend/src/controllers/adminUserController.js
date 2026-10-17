const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { AppError, asyncHandler, sendSuccess } = require("../lib/response");
const { normalizePhone } = require("../lib/userProvisioning");
const { revokeAllAdminSessions } = require("../lib/adminSession");
const { writeAudit } = require("../lib/audit");
const { STAFF_ROLES } = require("../lib/permissions");

const BCRYPT_ROUNDS = 10;

const pharmacistSelect = {
  id: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  branchId: true,
  lastLoginAt: true,
  mustChangePassword: true,
  createdAt: true,
  branch: { select: { id: true, name: true, slug: true, isActive: true, archivedAt: true } },
};

function staffFields(user, extra = {}) {
  return {
    name: user.name,
    phone: user.phone,
    role: user.role,
    branchId: user.branchId || null,
    status: user.status,
    ...extra,
  };
}

function serializePharmacist(user) {
  return {
    id: user.id,
    fullName: user.name,
    name: user.name,
    phone: user.phone,
    role: user.role,
    branchId: user.branchId,
    branchName: user.branch?.name || "",
    branch: user.branch
      ? {
          id: user.branch.id,
          name: user.branch.name,
          slug: user.branch.slug,
          isActive: user.branch.isActive,
        }
      : null,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

function assertAssignableBranch(branch) {
  if (!branch || branch.archivedAt) {
    throw new AppError("Filial topilmadi", 404, "NOT_FOUND");
  }
  if (!branch.isActive) {
    throw new AppError("Faqat faol filialga biriktirish mumkin", 409, "BRANCH_INACTIVE");
  }
  return branch;
}

async function requireBranch(branchId) {
  const branch = await prisma.branch.findUnique({
    where: { id: String(branchId) },
    select: { id: true, name: true, isActive: true, archivedAt: true },
  });
  return assertAssignableBranch(branch);
}

const listPharmacists = asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { in: STAFF_ROLES }, deletedAt: null },
    select: pharmacistSelect,
    orderBy: { name: "asc" },
  });
  return sendSuccess(res, users.map(serializePharmacist), "Xodimlar");
});

const createPharmacist = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const role = req.body.role || "BRANCH_ADMIN";
  const branchId = role === "BRANCH_ADMIN" ? req.body.branchId : null;
  if (role === "BRANCH_ADMIN") await requireBranch(branchId);

  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true, deletedAt: true } });
  if (existing && !existing.deletedAt) {
    throw new AppError("Bu telefon allaqachon ro'yxatdan o'tgan", 409, "PHONE_TAKEN");
  }

  const data = {
    name: req.body.fullName.trim(),
    phone,
    passwordHash: await bcrypt.hash(req.body.password, BCRYPT_ROUNDS),
    role,
    branchId,
    status: "ACTIVE",
    mustChangePassword: true,
    deletedAt: null,
  };
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data, select: pharmacistSelect })
    : await prisma.user.create({ data, select: pharmacistSelect });

  await writeAudit(prisma, {
    req,
    action: "STAFF_CREATED",
    entityType: "User",
    entityId: user.id,
    branchId: user.branchId,
    summary: `${user.name}, ${user.role}`,
    after: staffFields(user, { passwordChanged: true }),
  });
  return sendSuccess(res, serializePharmacist(user), "Farmatsevt qo'shildi", 201);
});

const updatePharmacist = asyncHandler(async (req, res) => {
  const current = await prisma.user.findFirst({
    where: { id: req.params.id, role: { in: STAFF_ROLES }, deletedAt: null },
    select: { id: true, name: true, phone: true, role: true, branchId: true, status: true },
  });
  if (!current) {
    throw new AppError("Xodim topilmadi", 404, "NOT_FOUND");
  }

  const data = {};
  const nextRole = req.body.role || current.role;
  if (req.body.fullName != null) data.name = req.body.fullName.trim();
  if (req.body.role != null) data.role = req.body.role;
  if (nextRole === "MANAGER") {
    data.branchId = null;
  } else if (req.body.branchId != null && req.body.branchId !== current.branchId) {
    await requireBranch(req.body.branchId);
    data.branchId = req.body.branchId;
  } else if (nextRole === "BRANCH_ADMIN" && !current.branchId && !req.body.branchId) {
    throw new AppError("Filialni tanlang", 400, "VALIDATION_ERROR");
  }
  if (req.body.phone != null) {
    const phone = normalizePhone(req.body.phone);
    const taken = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (taken && taken.id !== current.id) {
      throw new AppError("Bu telefon allaqachon ro'yxatdan o'tgan", 409, "PHONE_TAKEN");
    }
    data.phone = phone;
  }
  if (req.body.password) {
    data.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
    data.mustChangePassword = true;
    data.tokenVersion = { increment: 1 };
  }

  const user = await prisma.user.update({
    where: { id: current.id },
    data,
    select: pharmacistSelect,
  });
  if (req.body.password) await revokeAllAdminSessions(current.id);
  const roleChanged = user.role !== current.role;
  await writeAudit(prisma, {
    req,
    action: roleChanged ? "ROLE_CHANGED" : "STAFF_UPDATED",
    entityType: "User",
    entityId: user.id,
    branchId: user.branchId,
    summary: user.name,
    before: staffFields(current),
    after: staffFields(user),
  });
  if (req.body.password) {
    await writeAudit(prisma, {
      req,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: user.id,
      summary: `${user.name}: parol yangilandi`,
      before: { passwordChanged: false },
      after: { passwordChanged: true },
    });
  }

  return sendSuccess(res, serializePharmacist(user), "Xodim yangilandi");
});

async function findStaff(id) {
  const current = await prisma.user.findFirst({
    where: { id, role: { in: STAFF_ROLES }, deletedAt: null },
    select: { id: true, name: true, phone: true, role: true, branchId: true, status: true },
  });
  if (!current) throw new AppError("Xodim topilmadi", 404, "NOT_FOUND");
  return current;
}

const setStaffStatus = asyncHandler(async (req, res) => {
  const current = await findStaff(req.params.id);
  const status = req.body.status;
  if (status === "SUSPENDED") {
    await revokeAllAdminSessions(current.id);
  }
  const user = await prisma.user.update({
    where: { id: current.id },
    data: {
      status,
      ...(status === "SUSPENDED" ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: pharmacistSelect,
  });
  await writeAudit(prisma, {
    req,
    action: "STAFF_STATUS",
    entityType: "User",
    entityId: user.id,
    branchId: user.branchId,
    summary: `${user.name}: ${status}`,
    before: { status: current.status },
    after: { status: user.status },
  });
  return sendSuccess(res, serializePharmacist(user), status === "ACTIVE" ? "Xodim faollashtirildi" : "Xodim to'xtatildi");
});

const deletePharmacist = asyncHandler(async (req, res) => {
  const current = await findStaff(req.params.id);
  await revokeAllAdminSessions(current.id);
  await prisma.user.update({
    where: { id: current.id },
    data: {
      deletedAt: new Date(),
      status: "SUSPENDED",
      phone: `deleted:${current.id}`,
      branchId: null,
      tokenVersion: { increment: 1 },
    },
  });
  await writeAudit(prisma, {
    req,
    action: "STAFF_DELETED",
    entityType: "User",
    entityId: current.id,
    summary: current.name || current.phone,
    before: staffFields(current),
    after: { deleted: true, status: "SUSPENDED" },
  });
  return sendSuccess(res, { id: current.id }, "Xodim o'chirildi");
});

module.exports = {
  listPharmacists,
  createPharmacist,
  updatePharmacist,
  deletePharmacist,
  setStaffStatus,
  assertAssignableBranch,
};
