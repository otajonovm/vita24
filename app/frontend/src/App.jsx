import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { isTelegramFormField, setTelegramClosingConfirmation, syncTelegramBackButton } from "./lib/telegram";
import { useCartStore } from "./store/useCartStore";
import { useToastStore } from "./store/useToastStore";
import BottomNav from "./components/layout/BottomNav";
import Footer from "./components/layout/Footer";
import Header from "./components/layout/Header";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PageMeta from "./components/seo/PageMeta";
import { ErrorBoundary, SkeletonPage } from "./components/ui";
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

const BranchAdminPage = lazy(() => import("./pages/BranchAdminPage"));
const SuperAdminPage = lazy(() => import("./pages/SuperAdminPage"));
const CourierPage = lazy(() => import("./pages/CourierPage"));

function TelegramBridge() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const inner =
      location.pathname !== "/" &&
      !location.pathname.startsWith("/admin") &&
      !location.pathname.startsWith("/branch-admin") &&
      !location.pathname.startsWith("/courier");
    return syncTelegramBackButton(inner, () => navigate(-1));
  }, [location.pathname, navigate]);

  useEffect(() => {
    const sync = () => {
      const hasCart = useCartStore.getState().items.some((item) => Number(item.quantity) > 0);
      setTelegramClosingConfirmation(hasCart || isTelegramFormField(document.activeElement));
    };
    sync();
    const unsub = useCartStore.subscribe(sync);
    const onBlur = () => window.setTimeout(sync, 0);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onBlur);
    return () => {
      unsub();
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", onBlur);
      setTelegramClosingConfirmation(false);
    };
  }, []);

  return null;
}

function StorefrontShell({ children }) {
  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-clip bg-canvas text-slate-900">
      <Header />
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-3 pb-4 pt-3 md:px-6 lg:pb-10">
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
    <div className="pointer-events-none fixed inset-x-0 top-[calc(7.5rem+var(--tg-safe-top,env(safe-area-inset-top,0px)))] z-40 flex flex-col items-center gap-2 px-3 md:top-[calc(4.75rem+var(--tg-safe-top,env(safe-area-inset-top,0px)))] lg:top-[calc(5rem+var(--tg-safe-top,env(safe-area-inset-top,0px)))]">
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
  const { t } = useTranslation();
  const location = useLocation();
  const isPharmacist = location.pathname.startsWith("/branch-admin");
  const isAdmin = location.pathname.startsWith("/admin");
  const isCourier = location.pathname.startsWith("/courier");
  const Shell = isPharmacist || isCourier ? PharmacistShell : isAdmin ? AdminShell : StorefrontShell;

  return (
    <Shell>
      <PageMeta
        title={t("meta.title")}
        description={t("meta.description")}
        path={location.pathname}
      />
      <Suspense fallback={<SkeletonPage />}>
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
            path="/courier"
            element={
              <ProtectedRoute role="COURIER">
                <CourierPage />
              </ProtectedRoute>
            }
          />
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
      {!isAdmin && !isPharmacist && !isCourier && <StoreToasts />}
      <TelegramBridge />
    </Shell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
