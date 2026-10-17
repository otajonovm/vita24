import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import AuthLoginModal from "../components/modals/AuthLoginModal";
import CustomerOrderList from "../components/orders/CustomerOrderList";
import { userError } from "../lib/userError";
import { fetchCustomerOrders } from "../services/api";
import { useAuthStore } from "../store/useAuthStore";

export default function OrdersPage() {
  const { t } = useTranslation();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  const loadOrders = useCallback(() => {
    if (!user?.phone) return Promise.resolve();
    return fetchCustomerOrders(user.phone).then((rows) => setOrders(rows || []));
  }, [user?.phone]);

  useEffect(() => {
    if (!token) {
      setOrders([]);
      setLoading(false);
      setLoginOpen(true);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError("");
    loadOrders()
      .catch((err) => {
        if (active) setError(userError(err, t, "orders.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, loadOrders, t]);

  return (
    <section className="grid gap-3">
      <h1 className="text-xl font-extrabold text-slate-900">{t("orders.title")}</h1>
      {loading && orders.length === 0 && <p className="text-sm text-slate-500">{t("orders.loading")}</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!loading && !error && !token && (
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center shadow-sm">
          <p className="text-sm text-slate-600">{t("orders.login")}</p>
          <button type="button" onClick={() => setLoginOpen(true)} className="mt-4 h-11 rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white">
            {t("common.login")}
          </button>
        </div>
      )}
      {!loading && !error && token && orders.length === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
            <ClipboardList className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-xl font-extrabold text-slate-900">{t("orders.empty")}</h2>
          <Link to="/" className="mt-5 inline-flex h-12 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white no-underline">
            {t("common.home")}
          </Link>
        </div>
      )}
      {orders.length > 0 && <CustomerOrderList orders={orders} onOrders={setOrders} />}
      <AuthLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSuccess={() => setLoginOpen(false)} />
    </section>
  );
}
