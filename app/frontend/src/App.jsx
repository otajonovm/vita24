import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Footer from "./components/layout/Footer";
import Header from "./components/layout/Header";
import BranchAdminPage from "./pages/BranchAdminPage";
import CartPage from "./pages/CartPage";
import HomePage from "./pages/HomePage";
import SuperAdminPage from "./pages/SuperAdminPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-canvas text-slate-900">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/branch-admin" element={<BranchAdminPage />} />
            <Route path="/admin" element={<SuperAdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
