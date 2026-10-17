import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";
import { Lock, Phone } from "lucide-react";
import AdminLayout from "../components/admin/AdminLayout";
import { CatalogManager } from "../components/admin/AdminCatalog";
import { ShowcasePanel } from "../components/admin/AdminShowcase";
import { PromoManager } from "../components/admin/AdminPromos";
import { NetworkStock } from "../components/admin/AdminStock";
import { CustomerManager } from "../components/admin/AdminCustomers";
import { BranchManager, PharmacistManager } from "../components/admin/AdminManagers";
import {
  DashboardPanel,
  LekkoPanel,
  SettingsPanel,
} from "../components/admin/AdminPanels";
import { AdminOrderPage, OrdersPanel, PrescriptionQueue, RefundsPanel } from "../components/admin/AdminCommerce";
import { AuditPanel } from "../components/admin/AdminAudit";
import { ConfirmProvider } from "../components/admin/ui";
import PasswordChangeForm from "../components/auth/PasswordChangeForm";
import { can } from "../lib/permissions";
import { staffLogin } from "../services/api";
import { useAdminAuth } from "../store/useAuthStore";

function fieldClass(invalid) {
  return `h-12 w-full rounded-xl border pl-10 pr-3 text-sm outline-none ring-brand/30 focus:ring-2 ${
    invalid ? "border-red-400" : "border-slate-200"
  }`;
}

function StaffGate({ permission, children }) {
  const { t } = useTranslation();
  const role = useAdminAuth((state) => state.user?.role);
  if (!can(role, permission)) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t("admin.forbidden")}</p>;
  }
  return children;
}

function SuperLogin() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState({});
  const setSession = useAdminAuth((state) => state.setSession);

  async function handleSubmit(event) {
    event.preventDefault();
    const next = {};
    if (!phone.trim()) next.phone = t("admin.validation.required");
    if (password.trim().length < 6) next.password = t("admin.validation.password");
    if (needs2fa && !/^\d{6}$/.test(totp)) next.totp = t("admin.validation.code");
    setFields(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    setError("");
    try {
      const result = await staffLogin({ phone, password, totp: needs2fa ? totp : undefined });
      if (result?.requires2fa) {
        setNeeds2fa(true);
        return;
      }
      if (result?.user?.role !== "SUPER_ADMIN" && result?.user?.role !== "MANAGER") {
        throw new Error(t("admin.superOnly"));
      }
      setSession(result.user, result.token, { refreshToken: result.refreshToken });
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || t("admin.loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-4">
      <section className="grid w-full max-w-md gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("admin.role.SUPER_ADMIN")}</p>
          <h1 className="mt-1 text-xl font-extrabold text-slate-900">{t("admin.loginTitle")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("admin.loginHint")}</p>
        </div>
        <form noValidate onSubmit={handleSubmit} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">{t("admin.phone")}</span>
            <span className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
              <input
                type="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setFields((current) => ({ ...current, phone: "" }));
                }}
                aria-invalid={Boolean(fields.phone)}
                className={fieldClass(fields.phone)}
              />
            </span>
            {fields.phone && <span className="text-xs font-medium text-red-600">{fields.phone}</span>}
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-slate-600">{t("admin.password")}</span>
            <span className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFields((current) => ({ ...current, password: "" }));
                }}
                aria-invalid={Boolean(fields.password)}
                className={fieldClass(fields.password)}
              />
            </span>
            {fields.password && <span className="text-xs font-medium text-red-600">{fields.password}</span>}
          </label>
          {needs2fa && (
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t("admin.loginCode")}</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totp}
                onChange={(event) => {
                  setTotp(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setFields((current) => ({ ...current, totp: "" }));
                }}
                aria-invalid={Boolean(fields.totp)}
                className={`h-12 w-full rounded-xl border px-3 text-sm outline-none ring-brand/30 focus:ring-2 ${fields.totp ? "border-red-400" : "border-slate-200"}`}
              />
              {fields.totp && <span className="text-xs font-medium text-red-600">{fields.totp}</span>}
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-xl bg-brand text-sm font-bold text-white hover:bg-[#066341] disabled:opacity-50"
          >
            {loading ? t("admin.checking") : t("admin.signIn")}
          </button>
        </form>
      </section>
    </div>
  );
}

export default function SuperAdminPage() {
  const { t } = useTranslation();
  const user = useAdminAuth((state) => state.user);
  const token = useAdminAuth((state) => state.token);
  const isPanel = Boolean(token && (user?.role === "SUPER_ADMIN" || user?.role === "MANAGER"));

  if (!isPanel) return <SuperLogin />;
  if (user?.mustChangePassword) {
    return (
      <PasswordChangeForm
        audience="admin"
        onChanged={(session) =>
          useAdminAuth.getState().setSession(session?.user || { ...user, mustChangePassword: false }, session?.token, {
            refreshToken: session?.refreshToken,
          })
        }
      />
    );
  }

  return (
    <ConfirmProvider>
      <AdminLayout>
        <Routes>
          <Route path="/" element={<DashboardPanel />} />
          <Route path="orders" element={<OrdersPanel />} />
          <Route path="orders/:id" element={<AdminOrderPage />} />
          <Route path="prescriptions" element={<PrescriptionQueue />} />
          <Route path="refunds" element={<StaffGate permission="refunds.manage"><RefundsPanel /></StaffGate>} />
          <Route path="branches" element={<StaffGate permission="branches.manage"><BranchManager /></StaffGate>} />
          <Route path="staff" element={<StaffGate permission="staff.manage"><PharmacistManager /></StaffGate>} />
          <Route
            path="customers"
            element={<StaffGate permission="customers.manage"><CustomerManager /></StaffGate>}
          />
          <Route path="catalog" element={<StaffGate permission="catalog.manage"><CatalogManager /></StaffGate>} />
          <Route path="stock" element={<StaffGate permission="stock.manage"><NetworkStock /></StaffGate>} />
          <Route path="showcase" element={<StaffGate permission="catalog.manage"><ShowcasePanel /></StaffGate>} />
          <Route
            path="promos"
            element={<StaffGate permission="promos.manage"><PromoManager /></StaffGate>}
          />
          <Route path="lekko" element={<StaffGate permission="keys.manage"><LekkoPanel /></StaffGate>} />
          <Route path="settings" element={<StaffGate permission="settings.manage"><SettingsPanel /></StaffGate>} />
          <Route path="audit" element={<StaffGate permission="audit.read"><AuditPanel /></StaffGate>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AdminLayout>
    </ConfirmProvider>
  );
}
