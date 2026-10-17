import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  BookOpen,
  Building2,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  ScrollText,
  Settings,
  Star,
  Ticket,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { can } from "../../lib/permissions";
import { logoutAdminSession } from "../../services/api";
import { useAdminAuth } from "../../store/useAuthStore";
import { AdminToasts, useConfirm } from "./ui";

const NAV = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "admin.nav.dashboard", permission: "dashboard.read" },
  { to: "/admin/orders", icon: ClipboardList, label: "admin.nav.orders", permission: "orders.read" },
  { to: "/admin/prescriptions", icon: FileText, label: "admin.nav.prescriptions", permission: "prescriptions.read" },
  { to: "/admin/refunds", icon: RotateCcw, label: "admin.nav.refunds", permission: "refunds.manage" },
  { to: "/admin/branches", icon: Building2, label: "admin.nav.branches", permission: "branches.manage" },
  { to: "/admin/staff", icon: Users, label: "admin.nav.staff", permission: "staff.manage" },
  { to: "/admin/customers", icon: UserRound, label: "admin.nav.customers", permission: "customers.manage" },
  { to: "/admin/catalog", icon: BookOpen, label: "admin.nav.catalog", permission: "catalog.manage" },
  { to: "/admin/stock", icon: Package, label: "admin.nav.stock", permission: "stock.manage" },
  { to: "/admin/showcase", icon: Star, label: "admin.nav.showcase", permission: "catalog.manage" },
  { to: "/admin/promos", icon: Ticket, label: "admin.nav.promos", permission: "promos.manage" },
  { to: "/admin/lekko", icon: KeyRound, label: "admin.nav.lekko", permission: "keys.manage" },
  { to: "/admin/settings", icon: Settings, label: "admin.nav.settings", permission: "settings.manage" },
  { to: "/admin/audit", icon: ScrollText, label: "admin.nav.audit", permission: "audit.read" },
];

export default function AdminLayout({ children }) {
  const { t } = useTranslation();
  const location = useLocation();
  const confirm = useConfirm();
  const user = useAdminAuth((state) => state.user);
  const logout = useAdminAuth((state) => state.logout);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  async function askLogout() {
    const ok = await confirm({
      title: t("admin.logoutConfirmTitle"),
      body: t("admin.logoutConfirm"),
      confirmLabel: t("admin.logout"),
      danger: true,
    });
    if (!ok) return;
    await logoutAdminSession();
    logout();
  }

  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      {mobileOpen && (
        <button type="button" aria-label={t("admin.cancel")} className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-[4.5rem]" : "lg:w-64"}`}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-100 px-3">
          {!collapsed && <p className="truncate px-2 text-sm font-extrabold text-brand">Vita24</p>}
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 lg:hidden" onClick={() => setMobileOpen(false)} aria-label={t("admin.cancel")}>
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="hidden h-10 w-10 place-items-center rounded-xl text-slate-500 lg:grid"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? t("admin.expand") : t("admin.collapse")}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV.filter((item) => can(user?.role, item.permission)).map((item) => {
            const Icon = item.icon;
            const label = t(item.label);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={label}
                className={({ isActive }) =>
                  `mb-1 flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold ${
                    isActive ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
                  } ${collapsed ? "lg:justify-center lg:px-0" : ""}`
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className={collapsed ? "lg:sr-only" : ""}>{label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("admin.menu")}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{user?.name || "—"}</p>
            <p className="text-xs text-slate-500">{t(`admin.role.${user?.role || "SUPER_ADMIN"}`)}</p>
          </div>
          <button type="button" onClick={askLogout} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t("admin.logout")}</span>
          </button>
        </header>
        {user?.role === "SUPER_ADMIN" && user?.totpEnabled === false ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
            {t("admin.twoFaBanner")}{" "}
            <Link to="/admin/settings" className="underline underline-offset-2">
              {t("admin.nav.settings")}
            </Link>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-6">{children}</main>
      </div>
      <AdminToasts />
    </div>
  );
}
