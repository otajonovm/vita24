const PERMISSIONS = {
  CUSTOMER: ["orders.own"],
  BRANCH_ADMIN: ["orders.branch", "prescriptions.branch", "stock.branch"],
  MANAGER: ["dashboard.read", "orders.read", "prescriptions.read", "reports.read"],
  SUPER_ADMIN: ["*"],
};

function hasPermission(role, permission) {
  const granted = PERMISSIONS[role] || [];
  return granted.includes("*") || granted.includes(permission);
}

function rolesWith(permission) {
  return Object.keys(PERMISSIONS).filter((role) => hasPermission(role, permission));
}

function usesAdminSession(role) {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}

const STAFF_ROLES = ["BRANCH_ADMIN", "MANAGER"];

module.exports = {
  PERMISSIONS,
  hasPermission,
  rolesWith,
  usesAdminSession,
  STAFF_ROLES,
};
