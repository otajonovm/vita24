import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useToastStore } from "./store/useToastStore";
import BottomNav from "./components/layout/BottomNav";
import Footer from "./components/layout/Footer";
import Header from "./components/layout/Header";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PageMeta from "./components/seo/PageMeta";
import CartPage from "./pages/CartPage";
import CatalogPage from "./pages/CatalogPage";
import FavoritesPage from "./pages/FavoritesPage";
import HomePage from "./pages/HomePage";
import LegalPage from "./pages/LegalPage";
import MedicinePage from "./pages/MedicinePage";
import NotFoundPage from "./pages/NotFoundPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import OrdersPage from "./pages/OrdersPage";
import ProfilePage from "./pages/ProfilePage";

function LoadingLine() {
  const { t } = useTranslation();
  return <p className="text-sm text-slate-500">{t("common.loading")}</p>;
}

const BranchAdminPage = lazy(() => import("./pages/BranchAdminPage"));
const SuperAdminPage = lazy(() => import("./pages/SuperAdminPage"));

function StorefrontShell({ children }) {
  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-canvas text-slate-900">
      <Header />
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-3 pb-24 pt-3 md:px-6 lg:pb-10">
        {children}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

function AdminShell({ children }) {
  return <div className="min-h-dvh bg-canvas text-slate-900">{children}</div>;
}

function PharmacistShell({ children }) {
  return (
    <div className="min-h-dvh bg-canvas text-slate-900">
      <main className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6">{children}</main>
    </div>
  );
}

function StoreToasts() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  if (!toasts?.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[4.5rem] z-40 flex flex-col items-center gap-2 px-3 md:top-20">
      {toasts.slice(-2).map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm"
        >
          <span className="min-w-0">{toast.message}</span>
          {toast.action?.label && (
            <button
              type="button"
              className="shrink-0 font-bold text-emerald-200"
              onClick={() => {
                toast.action.onClick?.();
                dismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isPharmacist = location.pathname.startsWith("/branch-admin");
  const isAdmin = location.pathname.startsWith("/admin");
  const Shell = isPharmacist ? PharmacistShell : isAdmin ? AdminShell : StorefrontShell;

  return (
    <Shell>
      <PageMeta
        title="Vita24 — Onlayn dorixona"
        description="Toshkent bo'ylab 24/7 onlayn dorixona. Filial tanlang, dori buyurtma qiling."
        path={location.pathname}
      />
      <Suspense fallback={<LoadingLine />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/medicine/:slug" element={<MedicinePage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route
            path="/branch-admin"
            element={
              <ProtectedRoute role="BRANCH_ADMIN">
                <BranchAdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute role="SUPER_ADMIN">
                <SuperAdminPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      {!isAdmin && !isPharmacist && <StoreToasts />}
    </Shell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
