import { ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { formatSom, STATUS_LABELS } from "../lib/format";
import { useCartStore } from "../store/useCartStore";

export default function OrdersPage() {
  const pendingOrder = useCartStore((state) => state.pendingOrder);

  if (!pendingOrder) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
          <ClipboardList className="h-5 w-5" />
        </span>
        <h1 className="mt-3 text-xl font-extrabold text-slate-900">Buyurtmalar yo'q</h1>
        <p className="mt-1 text-sm text-slate-500">Rasmiylashtirilgan buyurtmalar shu yerda ko'rinadi.</p>
        <Link
          to="/"
          className="mt-5 inline-flex h-12 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark md:h-11"
        >
          Bosh sahifa
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-extrabold text-slate-900">Buyurtmalarim</h1>
      <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-brand">{pendingOrder.orderNumber}</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">
          {STATUS_LABELS[pendingOrder.status] || pendingOrder.status}
        </p>
        <p className="mt-2 text-base font-bold tabular-nums text-slate-900">
          {formatSom(pendingOrder.totalAmount || pendingOrder.subtotal || 0)}
        </p>
        <Link to="/cart" className="mt-3 inline-flex text-sm font-bold text-brand no-underline">
          Holatni ko'rish
        </Link>
      </article>
    </div>
  );
}
