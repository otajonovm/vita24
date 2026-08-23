import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { formatSom, STATUS_LABELS } from "../lib/format";
import { fetchMedicines, fetchOrders, updateOrderStatus } from "../services/api";
import { useBranchStore } from "../store/useBranchStore";

export default function BranchAdminPage() {
  const branch = useBranchStore((state) => state.branch);
  const openModal = useBranchStore((state) => state.openModal);
  const [orders, setOrders] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [rejectId, setRejectId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [preview, setPreview] = useState(null);

  const load = async () => {
    if (!branch) return;
    setLoading(true);
    setError("");
    try {
      const [orderData, stockData] = await Promise.all([
        fetchOrders(branch.id),
        fetchMedicines({ branchId: branch.id }),
      ]);
      setOrders(orderData);
      setStock(stockData);
    } catch (err) {
      setError(err.message || "Ma'lumot olinmadi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [branch]);

  const pending = useMemo(
    () => orders.filter((order) => ["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(order.status)),
    [orders]
  );

  const handleStatus = async (orderId, status, cancelReason = "") => {
    setBusyId(orderId);
    try {
      const updated = await updateOrderStatus(orderId, status, cancelReason);
      setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, ...updated } : order)));
      setRejectId("");
      setRejectReason("");
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Amal bajarilmadi");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand">Farmatsevt paneli</p>
          <h1 className="text-xl font-extrabold md:text-3xl">{branch ? branch.name : "Filial tanlanmagan"}</h1>
          <p className="text-sm text-slate-500">Navbatda {pending.length} ta buyurtma.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button type="button" onClick={openModal} className="h-12 rounded-xl bg-brand-soft px-4 font-bold text-brand sm:h-11">
            Filialni almashtirish
          </button>
          <button type="button" onClick={load} className="h-12 rounded-xl bg-brand px-4 font-bold text-white sm:h-11">
            Yangilash
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Yuklanmoqda...</p>}

      <div className="grid gap-4">
        {orders.map((order) => {
          const active = ["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(order.status);
          const rxUrl = order.prescriptionUrl || order.prescription?.fileUrl;
          return (
            <article key={order.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{order.orderNumber}</strong>
                  <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
                <small className="text-slate-500">
                  {new Date(order.createdAt || Date.now()).toLocaleString("uz-UZ")}
                </small>
              </header>
              <p className="mt-2 text-sm">
                {order.customerName} · {order.customerPhone}
              </p>
              <p className="text-sm text-slate-500">{order.deliveryAddress}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {(order.items || []).map((item) => (
                  <li key={item.id || item.medicineId}>
                    {item.name || item.medicineId} × {item.quantity}
                    {item.isPrescription ? " · retseptli" : ""}
                  </li>
                ))}
              </ul>

              {rxUrl && (
                <button
                  type="button"
                  onClick={() => setPreview(rxUrl)}
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand"
                >
                  <FileText className="h-4 w-4" />
                  Retseptni kattalashtirish
                </button>
              )}

              <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <strong className="tabular-nums">{formatSom(order.totalAmount)}</strong>
                {active && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => handleStatus(order.id, "WAITING_PAYMENT")}
                      className="inline-flex h-12 items-center gap-1 rounded-xl bg-brand px-3 text-sm font-bold text-white md:h-10"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Tasdiqlash
                    </button>
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => setRejectId(order.id)}
                      className="inline-flex h-12 items-center gap-1 rounded-xl bg-red-50 px-3 text-sm font-bold text-red-600 md:h-10"
                    >
                      <XCircle className="h-4 w-4" />
                      Rad etish
                    </button>
                  </div>
                )}
              </footer>

              {rejectId === order.id && (
                <div className="mt-3 grid gap-2 rounded-xl bg-red-50 p-3">
                  <textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="Rad etish izohi"
                    className="rounded-xl border border-red-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleStatus(order.id, "CANCELLED", rejectReason)}
                    className="h-10 rounded-xl bg-red-600 text-sm font-bold text-white"
                  >
                    Izoh bilan rad etish
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!loading && orders.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-slate-500">
            Hozircha buyurtma yo'q.
          </p>
        )}
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-extrabold">Filial ombori</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Dori</th>
                <th className="pb-2">Dozasi</th>
                <th className="pb-2">Narx</th>
                <th className="pb-2">Qoldiq</th>
                <th className="pb-2">Retsept</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((medicine) => (
                <tr key={medicine.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{medicine.name}</td>
                  <td>{medicine.dosage}</td>
                  <td className="tabular-nums">{formatSom(medicine.price)}</td>
                  <td>{medicine.stockCount}</td>
                  <td>{medicine.isPrescription ? "Ha" : "Yo'q"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-slate-900/60 p-6"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <img src={preview} alt="Retsept" className="max-h-[80vh] max-w-full rounded-2xl bg-white p-2" />
        </div>
      )}
    </section>
  );
}
