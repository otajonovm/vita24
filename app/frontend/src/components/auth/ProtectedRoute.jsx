import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { useAdminAuth, useAuthStore, useCourierAuth, usePharmacistAuth } from "../../store/useAuthStore";

function roleAllowed(role, user) {
  if (role === "CUSTOMER") return user?.role === "CUSTOMER";
  if (role === "SUPER_ADMIN") return user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";
  if (role === "BRANCH_ADMIN") return user?.role === "BRANCH_ADMIN" || user?.role === "SUPER_ADMIN";
  if (role === "COURIER") return user?.role === "COURIER";
  return false;
}

function pickSession(role, customer, pharmacist, admin, courier) {
  if (role === "CUSTOMER") return customer;
  if (role === "SUPER_ADMIN") return admin;
  if (role === "COURIER") return courier;
  if (role === "BRANCH_ADMIN") {
    if (pharmacist.user?.role === "BRANCH_ADMIN" && pharmacist.token) return pharmacist;
    if (admin.user?.role === "SUPER_ADMIN" && admin.token) return admin;
    return pharmacist;
  }
  return customer;
}

export default function ProtectedRoute({ role, children }) {
  const { t } = useTranslation();
  const customer = useAuthStore();
  const pharmacist = usePharmacistAuth();
  const admin = useAdminAuth();
  const courier = useCourierAuth();
  const session = pickSession(role, customer, pharmacist, admin, courier);
  const allowed = roleAllowed(role, session.user);

  if (!session.token) {
    if (role === "CUSTOMER") return <Navigate to="/" replace />;
    return children;
  }

  if (!allowed) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {t("admin.forbidden")}
      </p>
    );
  }

  return children;
}
