import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Minus,
  Phone,
  Pill,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import PrescriptionModal from "../components/modals/PrescriptionModal";
import { formatReservation, formatSom, STATUS_LABELS } from "../lib/format";
import { lineTotal } from "../lib/mockData";
import { createOrder, mockPay } from "../services/api";
import { useAuthStore } from "../store/useAuthStore";
import { useBranchStore } from "../store/useBranchStore";
import { useCartStore } from "../store/useCartStore";

const emptyForm = {
  phone: "",
  fullName: "",
  deliveryAddress: "",
};

export default function CartPage() {
  const branch = useBranchStore((state) => state.branch);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const clearCart = useCartStore((state) => state.clearCart);
  const prescription = useCartStore((state) => state.prescription);
  const hasPrescriptionItems = useCartStore((state) =>
    state.items.some((item) => item.medicine.isPrescription)
  );
  const totalAmount = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const pendingOrder = useCartStore((state) => state.pendingOrder);
  const reservationUntil = useCartStore((state) => state.reservationUntil);
  const startReservation = useCartStore((state) => state.startReservation);
  const clearReservation = useCartStore((state) => state.clearReservation);

  const [form, setForm] = useState(emptyForm);
  const [rxOpen, setRxOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      phone: current.phone || user.phone || "",
      fullName: current.fullName || user.name || "",
      deliveryAddress: current.deliveryAddress,
    }));
  }, [user]);

  const remaining = reservationUntil ? reservationUntil - now : 0;
  const expired = Boolean(reservationUntil) && remaining <= 0;
  const timerLabel = formatReservation(remaining);

  const canCheckout =
    items.length > 0 &&
    branch &&
    /^\+998\d{9}$/.test(form.phone.replace(/\s/g, "")) &&
    form.fullName.trim() &&
    form.deliveryAddress.trim() &&
    (!hasPrescriptionItems || Boolean(prescription?.fileUrl));

  const handleOrder = async (event) => {
    event.preventDefault();
    if (!canCheckout) return;
    setSubmitting(true);
    setError("");

    try {
      const result = await createOrder({
        phone: form.phone.replace(/\s/g, "").trim(),
        fullName: form.fullName.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        branchId: branch.id,
        items: items.map((item) => ({
          medicineId: item.medicine.id,
          quantity: item.quantity,
          unitPrice: item.medicine.price,
          isPrescription: item.medicine.isPrescription,
          name: item.medicine.name,
        })),
        prescriptionUrl: hasPrescriptionItems ? prescription?.fileUrl : undefined,
        prescription: hasPrescriptionItems ? prescription : null,
      });

      if (result.user) setSession(result.user);
      startReservation(result.order);
      clearCart();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Buyurtma yuborilmadi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMockPay = async () => {
    if (!pendingOrder?.id) return;
    setPaying(true);
    setError("");
    try {
      const paid = await mockPay(pendingOrder.id);
      startReservation(paid);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "To'lov bajarilmadi");
    } finally {
      setPaying(false);
    }
  };

  if (pendingOrder) {
    const paid = pendingOrder.status === "PAID";
    const canPay = pendingOrder.status === "WAITING_PAYMENT" && !expired;
    const awaitingReview = ["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(
      pendingOrder.status
    );

    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Buyurtma holati</p>
        <h1 className="mt-1 text-3xl font-extrabold text-slate-900">{pendingOrder.orderNumber}</h1>
        {user && (
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <User className="h-4 w-4 text-brand" />
            {user.name} · {user.phone}
          </p>
        )}
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">
          {paid ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {STATUS_LABELS[pendingOrder.status] || pendingOrder.status}
        </p>

        {!paid && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm ${
              expired ? "bg-red-50 text-red-700" : "bg-brand-soft text-brand"
            }`}
          >
            {expired ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {expired ? "Zaxira muddati tugadi. Qoldiqni yangilang." : `Zaxira: ${timerLabel}`}
          </div>
        )}

        {awaitingReview && (
          <p className="mt-3 flex items-start gap-2 text-sm text-slate-500">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            Farmatsevt tasdiqlamaguncha to'lov ochilmaydi.
          </p>
        )}

        {error && (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {!paid && (
            <button
              type="button"
              disabled={!canPay || paying}
              onClick={handleMockPay}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand-hover disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {paying ? "To'lov..." : "Test to'lovi"}
            </button>
          )}
          {paid && (
            <p className="inline-flex h-11 items-center gap-2 font-semibold text-brand">
              <CheckCircle2 className="h-5 w-5" />
              To'lov qabul qilindi
            </p>
          )}
          <button
            type="button"
            onClick={clearReservation}
            className="h-11 rounded-xl bg-slate-100 px-4 font-bold text-slate-800"
          >
            Yangi buyurtma
          </button>
          <Link to="/" className="inline-flex h-11 items-center rounded-xl px-4 font-bold text-brand">
            Katalogga qaytish
          </Link>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-extrabold text-slate-900">Savatcha bo'sh</h1>
        <p className="mt-2 text-slate-500">Kerakli dorilarni katalogdan qo'shing.</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-hover"
        >
          Dorilarni ko'rish
        </Link>
      </section>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_0.7fr]">
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h1 className="text-3xl font-extrabold text-slate-900">Savatcha</h1>

        {hasPrescriptionItems && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div>
              <strong className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-4 w-4" />
                Retsept suratini yuklang
              </strong>
              <p className="mt-1 text-sm text-red-600">
                {prescription?.fileName
                  ? `Yuklangan: ${prescription.fileName}`
                  : "Retseptli dori bor. Fayl yuklanmaguncha buyurtma yuborilmaydi."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRxOpen(true)}
              className="h-11 rounded-xl bg-white px-4 text-sm font-bold text-red-700"
            >
              {prescription ? "Almashtirish" : "Retsept yuklash"}
            </button>
          </div>
        )}

        <div className="mt-4 divide-y divide-slate-100">
          {items.map((item) => (
            <article
              key={`${item.medicine.id}-${item.selectedUnit}`}
              className="flex flex-wrap items-center gap-3 py-4"
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
                <Pill className="h-5 w-5" />
              </div>
              <div className="min-w-40 flex-1">
                <h3 className="font-bold text-slate-900">
                  {item.medicine.name}
                  {item.medicine.isPrescription && (
                    <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                      Retseptli
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500">
                  {item.selectedUnit === "pachka" ? "pachka" : "dona"} ·{" "}
                  {formatSom(item.medicine.price)}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft p-1">
                <button
                  type="button"
                  onClick={() =>
                    updateQuantity(item.medicine.id, item.selectedUnit, item.quantity - 1)
                  }
                  className="grid h-8 w-8 place-items-center rounded-full bg-white"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-6 text-center text-sm font-bold">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() =>
                    updateQuantity(item.medicine.id, item.selectedUnit, item.quantity + 1)
                  }
                  className="grid h-8 w-8 place-items-center rounded-full bg-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <strong className="tabular-nums text-slate-900">{formatSom(lineTotal(item))}</strong>
              <button
                type="button"
                onClick={() => removeFromCart(item.medicine.id, item.selectedUnit)}
                className="text-red-600"
                aria-label="O'chirish"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </article>
          ))}
        </div>
      </section>

      <form
        className="sticky top-24 grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
        onSubmit={handleOrder}
      >
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Buyurtmani rasmiylashtirish</h2>
          <p className="mt-1 text-sm text-slate-500">
            Login yoki ro'yxatdan o'tish shart emas. Telefon raqamingiz buyurtma bilan
            avtomatik birikadi.
          </p>
          {branch && (
            <p className="mt-2 flex items-center gap-2 text-sm text-brand">
              <MapPin className="h-4 w-4" />
              {branch.name}
            </p>
          )}
        </div>

        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Telefon raqami
          <span className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              required
              type="tel"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="+998901234567"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </span>
        </label>

        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Ism-familiya
          <span className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              required
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
              placeholder="Ali Valiyev"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </span>
        </label>

        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Yetkazib berish manzili
          <span className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <textarea
              required
              rows={3}
              value={form.deliveryAddress}
              onChange={(event) => setForm({ ...form, deliveryAddress: event.target.value })}
              placeholder="Toshkent, Chilonzor, 12-kvartal, 5-uy"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </span>
        </label>

        {hasPrescriptionItems && !prescription?.fileUrl && (
          <p className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Retsept yuklanmaguncha buyurtma yuborilmaydi.
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-slate-500">Jami</span>
          <strong className="text-lg tabular-nums text-slate-900">{formatSom(totalAmount)}</strong>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canCheckout || submitting}
          className="h-12 rounded-xl bg-brand font-bold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {submitting ? "Yuborilmoqda..." : "Buyurtma berish"}
        </button>
      </form>

      <PrescriptionModal open={rxOpen} onClose={() => setRxOpen(false)} />
    </div>
  );
}
