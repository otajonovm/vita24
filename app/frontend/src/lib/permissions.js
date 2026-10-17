const PERMISSIONS = {
  CUSTOMER: ["orders.own"],
  BRANCH_ADMIN: ["orders.branch", "prescriptions.branch", "stock.branch"],
  MANAGER: ["dashboard.read", "orders.read", "prescriptions.read", "reports.read"],
  SUPER_ADMIN: ["*"],
};

export function can(role, permission) {
  const granted = PERMISSIONS[role] || [];
  return granted.includes("*") || granted.includes(permission);
}
