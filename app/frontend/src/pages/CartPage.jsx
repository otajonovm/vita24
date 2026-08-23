import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Minus,
  Phone,
  Pill,
  Plus,
  Trash2,
  UploadCloud,
  User,
  Wallet,
} from "lucide-react";
import MapCheckoutSection from "../components/checkout/MapCheckoutSection";
import { formatReservation, formatSom, STATUS_LABELS } from "../lib/format";
import { lineTotal } from "../lib/mockData";
import { createOrder, fetchSavedAddress, mockPay, saveCustomerAddress } from "../services/api";
import { useAuthStore } from "../store/useAuthStore";
import { useBranchStore } from "../store/useBranchStore";
import { useCartStore } from "../store/useCartStore";

const PAYMENT_OPTIONS = [
  { id: "payme", label: "Payme" },
  { id: "click", label: "Click" },
  { id: "cash", label: "Naqd pul" },
];

export default function CartPage() {
  const navigate = useNavigate();
  const branch = useBranchStore((state) => state.branch);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const clearCart = useCartStore((state) => state.clearCart);
  const prescription = useCartStore((state) => state.prescription);
  const setPrescription = useCartStore((state) => state.setPrescription);
  const hasPrescriptionItems = useCartStore((state) =>
    state.items.some((item) => item.medicine.isPrescription)
  );
  const totalAmount = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const pendingOrder = useCartStore((state) => state.pendingOrder);
  const reservationUntil = useCartStore((state) => state.reservationUntil);
  const checkoutHoldUntil = useCartStore((state) => state.checkoutHoldUntil);
  const ensureCheckoutHold = useCartStore((state) => state.ensureCheckoutHold);
  const paymentMethod = useCartStore((state) => state.paymentMethod);
  const setPaymentMethod = useCartStore((state) => state.setPaymentMethod);
  const address = useCartStore((state) => state.savedAddress) || {
    street: "",
    apartment: "",
    floor: "",
    intercom: "",
    lat: null,
    lng: null,
  };
  const setSavedAddress = useCartStore((state) => state.setSavedAddress);
  const startReservation = useCartStore((state) => state.startReservation);
  const clearReservation = useCartStore((state) => state.clearReservation);

  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (items.length > 0) ensureCheckoutHold();
  }, [items.length, ensureCheckoutHold]);

  useEffect(() => {
    if (!user) return;
    setPhone((current) => current || user.phone || "");
    setFullName((current) => current || user.name || "");
    if (!address.street && user.lastStreet) {
      setSavedAddress({
        street: user.lastStreet,
        apartment: user.lastApartment || "",
        floor: user.lastFloor || "",
        intercom: user.lastIntercom || "",
        lat: user.lastLat,
        lng: user.lastLng,
      });
    }
  }, [user]);

  useEffect(() => {
    const normalized = phone.replace(/\s/g, "");
    if (!/^\+998\d{9}$/.test(normalized) || address.street) return undefined;
    let active = true;
    fetchSavedAddress(normalized).then((saved) => {
      if (!active || !saved?.street) return;
      setSavedAddress({
        street: saved.street,
        apartment: saved.apartment || "",
        floor: saved.floor || "",
        intercom: saved.intercom || "",
        lat: saved.lat,
        lng: saved.lng,
      });
      if (saved.fullName) setFullName((current) => current || saved.fullName);
    });
    return () => {
      active = false;
    };
  }, [phone]);

  useEffect(() => {
    const normalized = phone.replace(/\s/g, "");
    if (!address.street || !/^\+998\d{9}$/.test(normalized)) return undefined;
    const timer = setTimeout(() => {
      saveCustomerAddress({
        phone: normalized,
        fullName,
        street: address.street,
        apartment: address.apartment,
        floor: address.floor,
        intercom: address.intercom,
        lat: address.lat,
        lng: address.lng,
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [address, phone, fullName]);

  const holdUntil = reservationUntil || checkoutHoldUntil;
  const remaining = holdUntil ? holdUntil - now : 0;
  const expired = Boolean(holdUntil) && remaining <= 0;
  const timerLabel = formatReservation(remaining);

  const composedAddress = [
    address.street.trim(),
    address.apartment && `kv. ${address.apartment}`,
    address.floor && `${address.floor}-qavat`,
    address.intercom && `domofon ${address.intercom}`,
  ]
    .filter(Boolean)
    .join(", ");

  const canCheckout =
    items.length > 0 &&
    branch &&
    /^\+998\d{9}$/.test(phone.replace(/\s/g, "")) &&
    fullName.trim() &&
    address.street.trim() &&
    (!hasPrescriptionItems || Boolean(prescription?.fileUrl));

  const readRxFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPrescription({
        fileName: file.name,
        fileUrl: String(reader.result),
        status: "PENDING",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleOrder = async (event) => {
    event.preventDefault();
    if (!canCheckout) return;
    setSubmitting(true);
    setError("");

    try {
      const result = await createOrder({
        phone: phone.replace(/\s/g, "").trim(),
        fullName: fullName.trim(),
        deliveryAddress: composedAddress,
        lat: address.lat,
        lng: address.lng,
        street: address.street,
        apartment: address.apartment,
        floor: address.floor,
        intercom: address.intercom,
        branchId: branch.id,
        items: items.map((item) => ({
          medicineId: item.medicine.id,
          quantity: item.quantity,
          unitPrice: item.medicine.price,
          isPrescription: item.medicine.isPrescription,
          name: item.medicine.name,
        })),
        paymentMethod,
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
    const canPay =
      ["WAITING_PAYMENT", "PENDING_BRANCH"].includes(pendingOrder.status) && !expired;
    const awaitingReview = ["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(pendingOrder.status);

    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Orqaga
        </button>
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Buyurtma holati</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{pendingOrder.orderNumber}</h1>
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
            className={`mt-4 flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
              expired
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {expired ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {expired ? "Zaxira muddati tugadi." : `Dorilar ${timerLabel} gacha zaxirada saqlanadi`}
          </div>
        )}
        {awaitingReview && (
          <p className="mt-3 text-sm text-slate-500">Farmatsevt tasdiqlamaguncha to'lov ochilmaydi.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 grid gap-2">
          {!paid && (
            <button
              type="button"
              disabled={!canPay || paying}
              onClick={handleMockPay}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {paying ? "To'lov..." : "Test to'lovi"}
            </button>
          )}
          <button
            type="button"
            onClick={clearReservation}
            className="h-11 rounded-xl bg-slate-100 font-bold text-slate-800"
          >
            Yangi buyurtma
          </button>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">Savatcha bo'sh</h1>
        <p className="mt-2 text-sm text-slate-500">Kerakli dorilarni katalogdan qo'shing.</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-12 items-center rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-dark md:h-11"
        >
          Dorilarni ko'rish
        </Link>
      </section>
    );
  }

  const payButton = (
    <button
      type="submit"
      disabled={!canCheckout || submitting || expired}
      className="h-12 w-full rounded-xl bg-[#087B51] text-sm font-bold text-white shadow-lg hover:bg-[#1A6840] disabled:opacity-50"
    >
      {submitting ? "Yuborilmoqda..." : `${formatSom(totalAmount)} to'lash`}
    </button>
  );

  return (
    <form className="pb-28 lg:pb-0" onSubmit={handleOrder}>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-700 shadow-sm lg:h-12 lg:w-12"
          aria-label="Orqaga"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-extrabold leading-tight text-slate-900 md:text-2xl">
          Yetkazib berish manzili va rasmiylashtirish
        </h1>
      </div>

      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
        <div className="grid gap-3 lg:col-span-7">
          <section className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:p-5">
            {items.map((item) => (
              <article
                key={`${item.medicine.id}-${item.selectedUnit}`}
                className="flex items-center gap-2.5 border-b border-slate-100 py-3 last:border-0 last:pb-0 first:pt-0"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-slate-50 text-brand">
                  <Pill className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-slate-900">{item.medicine.name}</h3>
                  <p className="text-xs font-bold tabular-nums text-slate-900">
                    {formatSom(lineTotal(item))}
                  </p>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-brand-soft p-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(item.medicine.id, item.selectedUnit, item.quantity - 1)
                    }
                    className="grid h-7 w-7 place-items-center rounded-full bg-white"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-4 text-center text-xs font-bold">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(item.medicine.id, item.selectedUnit, item.quantity + 1)
                    }
                    className="grid h-7 w-7 place-items-center rounded-full bg-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.medicine.id, item.selectedUnit)}
                  className="text-red-500"
                  aria-label="O'chirish"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </article>
            ))}
          </section>

          <MapCheckoutSection
            street={address.street}
            apartment={address.apartment}
            floor={address.floor}
            intercom={address.intercom}
            lat={address.lat}
            lng={address.lng}
            onChange={(next) => setSavedAddress(next)}
          />

          {hasPrescriptionItems && (
            <label className="grid cursor-pointer place-items-center gap-2 rounded-2xl border-2 border-dashed border-red-200 bg-red-50 p-4 text-center">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                hidden
                onChange={(event) => readRxFile(event.target.files?.[0])}
              />
              <UploadCloud className="h-7 w-7 text-red-500" />
              <strong className="text-sm text-red-700">Retsept suratini yuklang</strong>
              <span className="text-xs text-red-600">
                {prescription?.fileName ? `Yuklangan: ${prescription.fileName}` : "JPG, PNG yoki PDF"}
              </span>
            </label>
          )}

          <section className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:p-5">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Telefon
              <span className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+998901234567"
                  className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
                />
              </span>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Ism-familiya
              <span className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Ali Valiyev"
                  className="h-12 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
                />
              </span>
            </label>
          </section>
        </div>

        <aside className="mt-3 grid gap-3 lg:col-span-5 lg:mt-0 lg:sticky lg:top-24">
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {expired
                ? "Zaxira muddati tugadi. Savatni yangilang."
                : `Dorilar ${timerLabel} gacha zaxirada saqlanadi`}
            </span>
          </div>

          <section className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:p-5">
            <p className="mb-2 text-sm font-bold text-slate-900">To'lov turi</p>
            <div className="grid gap-2">
              {PAYMENT_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={`flex h-12 items-center gap-3 rounded-xl border px-3 ${
                    paymentMethod === option.id ? "border-brand bg-brand-soft" : "border-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === option.id}
                    onChange={() => setPaymentMethod(option.id)}
                    className="accent-brand"
                  />
                  {option.id === "cash" ? (
                    <Wallet className="h-4 w-4 text-brand" />
                  ) : (
                    <CreditCard className="h-4 w-4 text-brand" />
                  )}
                  <span className="text-sm font-semibold text-slate-800">{option.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Mahsulotlar</span>
              <strong className="tabular-nums text-slate-900">{formatSom(totalAmount)}</strong>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="font-semibold text-slate-700">Jami</span>
              <strong className="text-lg font-bold tabular-nums text-slate-900">
                {formatSom(totalAmount)}
              </strong>
            </div>
            {error && (
              <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
            <div className="mt-4 hidden lg:block">{payButton}</div>
          </section>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+var(--tg-safe-bottom,env(safe-area-inset-bottom)))] z-20 px-3 lg:hidden">
        {payButton}
      </div>
    </form>
  );
}
