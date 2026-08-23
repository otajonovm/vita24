import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import BottomNav from "./components/layout/BottomNav";
import Footer from "./components/layout/Footer";
import Header from "./components/layout/Header";
import BranchAdminPage from "./pages/BranchAdminPage";
import CartPage from "./pages/CartPage";
import CatalogPage from "./pages/CatalogPage";
import FavoritesPage from "./pages/FavoritesPage";
import HomePage from "./pages/HomePage";
import OrdersPage from "./pages/OrdersPage";
import SuperAdminPage from "./pages/SuperAdminPage";

function StorefrontShell({ children }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-900">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-24 pt-3 md:px-6 lg:pb-10">
        {children}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

function AdminShell({ children }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-900">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin") || location.pathname.startsWith("/branch-admin");
  const Shell = isAdmin ? AdminShell : StorefrontShell;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/branch-admin" element={<BranchAdminPage />} />
        <Route path="/admin" element={<SuperAdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
