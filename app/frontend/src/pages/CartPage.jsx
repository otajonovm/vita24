import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import useLockBodyScroll from "../hooks/useLockBodyScroll";
import useSoftKeyboard from "../hooks/useSoftKeyboard";
import AuthLoginModal from "../components/modals/AuthLoginModal";
import { LoadingButton } from "../components/ui";
import { checkPromo, createOrder, fetchCartAvailability, fetchSavedAddress, mockPay, saveCustomerAddress, uploadPrescription } from "../services/api";
import { getCustomerOrderView } from "../lib/customerOrderView";
import { formatDateTime, formatGrouped, formatReservation, formatSom, isValidUzbekPhone, normalizePhoneInput } from "../lib/format";
import { DELIVERY_CITY, DELIVERY_ETA, quoteTotals } from "../lib/pricing";
import { hasPublicSettings, loadPublicSettings, peekPublicSettings } from "../lib/publicSettings";
import { SkeletonPulse } from "../components/ui";
import { userError } from "../lib/userError";
import { lineTotal, unitMultiplier } from "../lib/mockData";
import { displayName } from "../lib/personName";
import { useAuthStore } from "../store/useAuthStore";
import { useBranchStore } from "../store/useBranchStore";
import { useCartStore } from "../store/useCartStore";
import { useToastStore } from "../store/useToastStore";

function lineStock(item) {
  const pack = unitMultiplier(item.selectedUnit);
  const available = Number(item.medicine.available ?? item.medicine.stockCount ?? 0);
  const pieces = item.quantity * pack;
  if (available <= 0) return { kind: "missing", available };
  if (pieces > available) return { kind: "short", available };
  if (pieces + pack > available) return { kind: "max", available };
  return { kind: "", available };
}

const PAYMENT_OPTIONS = [
  { id: "payme", label: "Payme", flag: "paymeEnabled" },
  { id: "click", label: "Click", flag: "clickEnabled" },
  { id: "cash", labelKey: "cart.cash", flag: "cashEnabled" },
];

export default function CartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const branch = useBranchStore((state) => state.branch);
  const openModal = useBranchStore((state) => state.openModal);
  const pushToast = useToastStore((state) => state.push);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const setSession = useAuthStore((state) => state.setSession);
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const restoreLine = useCartStore((state) => state.restoreLine);
  const clearCart = useCartStore((state) => state.clearCart);
  const prescription = useCartStore((state) => state.prescription);
  const setPrescription = useCartStore((state) => state.setPrescription);
  const hasPrescriptionItems = useCartStore((state) =>
    state.items.some((item) => item.medicine.isPrescription)
  );
  const totalAmount = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const [leaving, setLeaving] = useState(false);
  const [rxPreview, setRxPreview] = useState("");
  const pendingOrder = useCartStore((state) => state.pendingOrder);
  const reservationUntil = useCartStore((state) => state.reservationUntil);
  const paymentMethod = useCartStore((state) => state.paymentMethod);
  const setPaymentMethod = useCartStore((state) => state.setPaymentMethod);
  const deliveryType = useCartStore((state) => state.deliveryType || "DELIVERY");
  const setDeliveryType = useCartStore((state) => state.setDeliveryType);
  const promo = useCartStore((state) => state.promo);
  const setPromo = useCartStore((state) => state.setPromo);
  const applyBranchStock = useCartStore((state) => state.applyBranchStock);
  const [shop, setShop] = useState(() => (hasPublicSettings() ? peekPublicSettings() : null));
  const shopReady = Boolean(shop);
  const totals = quoteTotals(totalAmount, {
    deliveryType,
    discount: promo?.discount || 0,
    deliveryFee: shop?.deliveryFee,
    freeFrom: shop?.freeDeliveryFrom,
  });
  const paymentOptions = PAYMENT_OPTIONS.filter((option) => !shop || shop[option.flag] !== false);
  const paymentOptionsKey = paymentOptions.map((option) => option.id).join(",");
  useEffect(() => {
    loadPublicSettings().then(setShop).catch(() => setShop(peekPublicSettings()));
  }, []);
  useEffect(() => {
    if (!shop) return;
    if (deliveryType === "PICKUP" && shop.pickupEnabled === false) setDeliveryType("DELIVERY");
    const options = PAYMENT_OPTIONS.filter((option) => shop[option.flag] !== false);
    if (options.length && !options.some((option) => option.id === paymentMethod)) {
      setPaymentMethod(options[0].id);
    }
  }, [shop, deliveryType, paymentMethod, paymentOptionsKey, setDeliveryType, setPaymentMethod]);
  const address = useCartStore((state) => state.savedAddress) || {
    street: "",
    apartment: "",
    floor: "",
    intercom: "",
    entrance: "",
    landmark: "",
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
  const [loginOpen, setLoginOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingRemove, setPendingRemove] = useState("");
  const keyboard = useSoftKeyboard();
  useLockBodyScroll(confirmClear);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [stockChecking, setStockChecking] = useState(false);
  const [stockError, setStockError] = useState("");
  const [submitStage, setSubmitStage] = useState("");
  const [uploadPct, setUploadPct] = useState(0);
  const addressRef = useRef(null);
  const rxRef = useRef(null);
  const phoneRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    if (!promo?.code || !token) return undefined;
    if (totalAmount <= 0) {
      setPromo(null);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      checkPromo(promo.code, totalAmount, branch?.id)
        .then((result) => {
          if (!active) return;
          if (Number(result.discount) !== Number(promo.discount)) {
            setPromo({ code: result.code, discount: result.discount });
          }
          setPromoError("");
        })
        .catch((err) => {
          if (!active) return;
          if (err.response?.data?.error?.code === "RATE_LIMIT") return;
          setPromo(null);
          setPromoError(userError(err, t, "cart.promoInvalid"));
        });
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [totalAmount, promo?.code, promo?.discount, branch?.id, token, setPromo, t]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) {
      setPhone("");
      setFullName("");
      return;
    }
    setPhone((current) => current || user.phone || "");
    setFullName((current) => displayName(current) || displayName(user.name));
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
    if (!prescription?.file || !String(prescription.file.type || "").startsWith("image/")) {
      setRxPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(prescription.file);
    setRxPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [prescription]);

  useEffect(() => {
    if (!token) return undefined;
    const normalized = normalizePhoneInput(phone);
    if (!isValidUzbekPhone(normalized) || address.street) return undefined;
    let active = true;
    fetchSavedAddress(normalized)
      .then((saved) => {
        if (!active || !saved?.street) return;
        setSavedAddress({
          street: saved.street,
          apartment: saved.apartment || "",
          floor: saved.floor || "",
          intercom: saved.intercom || "",
          lat: saved.lat,
          lng: saved.lng,
        });
        if (displayName(saved.fullName)) setFullName((current) => displayName(current) || displayName(saved.fullName));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [phone, token]);

  useEffect(() => {
    if (!token) return undefined;
    const normalized = normalizePhoneInput(phone);
    if (deliveryType === "PICKUP" || !address.street || !isValidUzbekPhone(normalized)) return undefined;
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
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [address, phone, fullName, token, deliveryType]);

  const cartIds = items.map((item) => item.medicine.id).join(",");
  useEffect(() => {
    if (!branch?.id || !cartIds) return undefined;
    let active = true;
    setStockChecking(true);
    setStockError("");
    fetchCartAvailability(branch.id, cartIds.split(","))
      .then((rows) => {
        if (!active) return;
        applyBranchStock(branch.id, rows || []);
      })
      .catch((err) => {
        if (!active) return;
        setStockError(userError(err, t, "cart.stockCheckFailed"));
      })
      .finally(() => {
        if (active) setStockChecking(false);
      });
    return () => {
      active = false;
    };
  }, [branch?.id, cartIds, applyBranchStock, t]);

  const holdUntil = pendingOrder ? reservationUntil : null;
  const remaining = holdUntil ? holdUntil - now : 0;
  const expired = Boolean(holdUntil) && remaining <= 0;
  const timerLabel = formatReservation(remaining);
  const normalizedPhone = normalizePhoneInput(phone);
  const phoneValid = isValidUzbekPhone(normalizedPhone);
  const nameValid = Boolean(displayName(fullName));
  const streetText = String(address.street || "").trim();
  const addressValid = deliveryType === "PICKUP" || Boolean(streetText);
  const prescriptionValid = !hasPrescriptionItems || Boolean(prescription?.file || prescription?.fileKey);
  const paymentsAvailable = paymentOptions.length > 0;

  const composedAddress = [
    streetText,
    address.apartment && `kv. ${address.apartment}`,
    address.floor && `${address.floor}-qavat`,
    address.entrance && `podyezd ${address.entrance}`,
    address.intercom && `domofon ${address.intercom}`,
    address.landmark && `mo'ljal ${address.landmark}`,
  ]
    .filter(Boolean)
    .join(", ");

  const readyForAuth =
    items.length > 0 &&
    branch &&
    phoneValid &&
    nameValid &&
    addressValid &&
    prescriptionValid &&
    paymentsAvailable &&
    !expired;
  const canCheckout = readyForAuth && Boolean(token);

  const checkoutHints = [
    !branch && t("cart.hint.branch"),
    !paymentsAvailable && t("cart.hint.payment"),
    !phoneValid && t("cart.hint.phone"),
    !nameValid && t("cart.hint.name"),
    !addressValid && t("cart.hint.address"),
    hasPrescriptionItems && !prescriptionValid && t("cart.hint.rx"),
    expired && t("cart.hint.expired"),
  ].filter(Boolean);

  const readRxFile = (file) => {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const mime = String(file.type || "").toLowerCase();
    const ext = String(file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
    const byExt = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };
    const resolved = allowed.includes(mime) ? mime : byExt[ext] || "";
    if (!allowed.includes(resolved) || file.size > 5 * 1024 * 1024) {
      setError(t("cart.fileType"));
      return;
    }
    setError("");
    setPrescription({
      file,
      fileName: file.name,
      status: "PENDING",
    });
  };

  const fieldProblems = {
    address: deliveryType !== "PICKUP" && !streetText ? t("cart.hint.address") : "",
    rx: hasPrescriptionItems && !prescriptionValid ? t("cart.hint.rx") : "",
    phone: !phoneValid ? t("cart.hint.phone") : "",
    name: !nameValid ? t("cart.hint.name") : "",
  };
  const stockBlocked = items.some((item) => ["missing", "short"].includes(lineStock(item).kind));
  const showProblem = (key) => Boolean((attempted || touched[key]) && fieldProblems[key]);
  const rxNames = items.filter((item) => item.medicine.isPrescription).map((item) => item.medicine.name);
  const holdKey = hasPrescriptionItems
    ? "cart.holdReview"
    : paymentMethod === "cash"
      ? deliveryType === "PICKUP"
        ? "cart.holdCashPickup"
        : "cart.holdCash"
      : "cart.hold";
  const holdMinutes = hasPrescriptionItems ? shop?.reviewWindowMinutes : shop?.paymentWindowMinutes;

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code || promoBusy) return;
    setPromoBusy(true);
    setPromoError("");
    try {
      const result = await checkPromo(code, totalAmount, branch?.id);
      setPromo({ code: result.code, discount: result.discount });
    } catch (err) {
      setPromo(null);
      setPromoError(userError(err, t, "cart.promoInvalid"));
    } finally {
      setPromoBusy(false);
    }
  }

  const handleOrder = async (event) => {
    event.preventDefault();
    setAttempted(true);
    const first = ["address", "rx", "phone", "name"].find((key) => fieldProblems[key]);
    if (first) {
      const node = { address: addressRef, rx: rxRef, phone: phoneRef, name: nameRef }[first].current;
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
      node?.focus();
    }
    if (!token) {
      setLoginOpen(true);
      setError(t("cart.needAuth"));
      return;
    }
    if (user?.status === "SUSPENDED") {
      setError(user.blockReason ? t("cart.blockedReason", { reason: user.blockReason }) : t("cart.blocked"));
      return;
    }
    if (!branch) {
      setError(t("cart.hint.branch"));
      openModal();
      return;
    }
    if (!paymentsAvailable) {
      setError(t("cart.hint.payment"));
      return;
    }
    if (first || stockBlocked || !canCheckout) {
      if (stockBlocked) setError(t("cart.stockBlock"));
      return;
    }
    setSubmitting(true);
    setSubmitStage("");
    setUploadPct(0);
    setError("");

    try {
      if (promo?.code) {
        try {
          const quoted = await checkPromo(promo.code, totalAmount, branch?.id);
          if (Number(quoted.discount) !== Number(promo.discount || 0)) {
            setPromo({ code: quoted.code, discount: quoted.discount });
            setSubmitting(false);
            return;
          }
        } catch (err) {
          if (err.response?.data?.error?.code !== "RATE_LIMIT") {
            setPromo(null);
            setPromoError(userError(err, t, "cart.promoInvalid"));
            setSubmitting(false);
            return;
          }
        }
      }
      let prescriptionFileKey;
      let prescriptionFileName;
      if (hasPrescriptionItems) {
        if (prescription?.fileKey) {
          prescriptionFileKey = prescription.fileKey;
          prescriptionFileName = prescription.fileName;
        } else if (prescription?.file) {
          setSubmitStage("rx");
          const uploaded = await uploadPrescription(prescription.file, setUploadPct);
          prescriptionFileKey = uploaded.fileKey;
          prescriptionFileName = uploaded.fileName || prescription.fileName;
        }
      }

      setSubmitStage("order");
      const result = await createOrder({
        phone: normalizedPhone,
        fullName: fullName.trim(),
        deliveryType,
        promoCode: promo?.code || null,
        deliveryAddress: deliveryType === "PICKUP" ? branch.address : composedAddress,
        lat: deliveryType === "PICKUP" ? null : address.lat,
        lng: deliveryType === "PICKUP" ? null : address.lng,
        street: deliveryType === "PICKUP" ? "" : address.street,
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
        prescriptionFileKey,
        prescriptionFileName,
      });

      if (result.user) setSession(result.user);
      const orderId = result.order?.id;
      if (!orderId) {
        setError(t("cart.failed"));
        return;
      }
      setLeaving(true);
      clearCart();
      navigate(`/orders/${orderId}`);
    } catch (err) {
      setError(userError(err, t, "cart.failed"));
    } finally {
      setSubmitting(false);
      setSubmitStage("");
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
      setError(userError(err, t, "cart.payFailed"));
    } finally {
      setPaying(false);
    }
  };

  if (pendingOrder) {
    const paid = pendingOrder.status === "PAID";
    const pendingView = getCustomerOrderView(pendingOrder);
    const canPay = pendingView.showPay && !expired;

    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </button>
        <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("cart.status")}</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{pendingOrder.orderNumber}</h1>
        {user && (
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <User className="h-4 w-4 text-brand" />
            {(displayName(user.name) || t("profile.enterName"))} · {user.phone}
          </p>
        )}
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">
          {paid ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {t(pendingView.titleKey)}
        </p>
        {pendingView.reservationKey && (
          <p className="mt-3 text-sm text-slate-600">{t(pendingView.reservationKey)}</p>
        )}
        {!paid && pendingView.showPayTimer && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${
              expired
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {expired ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            {expired
              ? t("cart.expired")
              : t("cart.left", { time: timerLabel, until: formatDateTime(holdUntil) })}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 grid gap-2">
          {pendingView.showPay && (
            <button
              type="button"
              disabled={!canPay || paying}
              onClick={handleMockPay}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand font-bold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {paying ? t("cart.paying") : t("cart.payTest")}
            </button>
          )}
          <button
            type="button"
            onClick={clearReservation}
            className="h-11 rounded-xl bg-slate-100 font-bold text-slate-800"
          >
            {t("cart.newOrder")}
          </button>
        </div>
      </section>
    );
  }

  if (leaving) return null;

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">{t("cart.empty")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("cart.emptyHint")}</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-12 items-center rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-dark md:h-11"
        >
          {t("cart.browse")}
        </Link>
      </section>
    );
  }

  const submitLabel = hasPrescriptionItems
    ? t("cart.submitRx")
    : paymentMethod === "cash"
      ? t("cart.submit")
      : t("cart.pay", { amount: formatSom(totals.totalAmount) });
  const submittingLabel =
    submitStage === "rx"
      ? t("cart.uploadingRx", { percent: uploadPct || 0 })
      : submitStage === "order"
        ? t("cart.creatingOrder")
        : t("cart.sending");

  const submitShort = hasPrescriptionItems
    ? t("cart.submitRxShort")
    : paymentMethod === "cash"
      ? t("cart.submitShort")
      : t("cart.payShort");

  const payButton = (label, extra = "") => (
    <LoadingButton
      type="submit"
      loading={submitting}
      loadingText={submittingLabel}
      className={`h-12 w-full min-w-0 rounded-xl bg-[#087B51] px-3 text-sm font-bold text-white shadow-lg hover:bg-[#1A6840] disabled:opacity-50 [&>span]:min-w-0 [&>span]:truncate ${extra}`}
    >
      {label}
    </LoadingButton>
  );

  return (
    <>
    <form className="lg:pb-0" onSubmit={handleOrder}>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-700 shadow-sm lg:h-12 lg:w-12"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-extrabold leading-tight text-slate-900 md:text-2xl">
          {t("cart.title")}
        </h1>
      </div>

      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">
        <div className="grid gap-3 lg:col-span-7">
          <section className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:p-5">
            {items.map((item) => (
              <article
                key={`${item.medicine.id}-${item.selectedUnit}`}
                className="flex items-center gap-2 border-b border-slate-100 py-3 last:border-0 last:pb-0 first:pt-0"
              >
                {pendingRemove === `${item.medicine.id}-${item.selectedUnit}` ? (
                  <button
                    type="button"
                    onClick={() => {
                      const removed = removeFromCart(item.medicine.id, item.selectedUnit);
                      setPendingRemove("");
                      if (!removed) return;
                      pushToast(t("cart.removed"), "info", {
                        duration: 5000,
                        action: { label: t("cart.undo"), onClick: () => restoreLine(removed) },
                      });
                    }}
                    className="grid h-10 min-w-10 shrink-0 place-items-center rounded-xl bg-red-600 px-2 text-xs font-bold text-white"
                  >
                    {t("cart.remove")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingRemove(`${item.medicine.id}-${item.selectedUnit}`)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-500 hover:bg-red-50"
                    aria-label={t("cart.remove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-50 text-brand">
                  <Pill className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-slate-900">{item.medicine.name}</h3>
                  {item.medicine.isPrescription && (
                    <p className="text-[11px] font-bold text-red-600">{t("cart.rxBadge")}</p>
                  )}
                  <p className="truncate text-xs font-bold tabular-nums text-slate-900">
                    {item.quantity > 1
                      ? `${formatGrouped(Number(item.medicine.price) * unitMultiplier(item.selectedUnit))} × ${item.quantity} = ${formatSom(lineTotal(item))}`
                      : formatSom(lineTotal(item))}
                  </p>
                  {(() => {
                    const stock = lineStock(item);
                    if (stock.kind === "missing") return <p className="text-xs font-semibold text-red-600">{t("cart.missingHere")}</p>;
                    if (stock.kind === "short" || stock.kind === "max") return <p className="text-xs font-semibold text-amber-700">{t("cart.onlyLeft", { count: stock.available })}</p>;
                    if (stock.available > 0 && stock.available <= 5) return <p className="text-xs font-semibold text-amber-700">{t("cart.lowStock")}</p>;
                    return null;
                  })()}
                </div>
                <div className="inline-flex shrink-0 items-center rounded-full bg-brand-soft p-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(item.medicine.id, item.selectedUnit, item.quantity - 1)
                    }
                    className="grid h-10 w-10 place-items-center rounded-full bg-white"
                    aria-label={t("cart.decrease")}
                  >
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="min-w-5 text-center text-xs font-bold">{item.quantity}</span>
                  <button
                    type="button"
                    disabled={Boolean(lineStock(item).kind)}
                    title={lineStock(item).kind ? t("cart.onlyLeft", { count: lineStock(item).available }) : undefined}
                    onClick={() =>
                      updateQuantity(item.medicine.id, item.selectedUnit, item.quantity + 1)
                    }
                    className="grid h-10 w-10 place-items-center rounded-full bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={t("cart.increase")}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </article>
            ))}
            <button type="button" onClick={() => setConfirmClear(true)} className="mt-2 text-left text-sm font-bold text-red-600">
              {t("cart.clear")}
            </button>
          </section>

          <h2 className="px-1 text-base font-extrabold text-slate-900">{t("cart.checkout")}</h2>
          <button
            type="button"
            onClick={openModal}
            title={branch ? `${branch.name}. ${t("header.branchHint")}` : t("branch.pick")}
            className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#087B51]">{t("header.branch")}</span>
            <strong className="mt-1 block text-sm text-slate-900">{branch?.name || t("branch.pick")}</strong>
            <span className="mt-1 block text-xs text-slate-500">{t("header.branchHint")}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            {!shopReady && (
              <>
                <SkeletonPulse className="h-11 w-full" />
                <SkeletonPulse className="h-11 w-full" />
              </>
            )}
            {shopReady && [
              ["DELIVERY", "cart.deliveryMode"],
              ["PICKUP", "cart.pickupMode"],
            ].filter(([id]) => id === "DELIVERY" || shop.pickupEnabled !== false).map(([id, key]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDeliveryType(id)}
                title={t(key)}
                className={`flex h-11 min-w-0 items-center justify-center truncate rounded-xl border px-2 text-sm font-bold ${deliveryType === id ? "border-brand bg-brand-soft text-brand" : "border-slate-200 bg-white text-slate-700"}`}
              >
                {t(id === "DELIVERY" ? "cart.deliveryShort" : "cart.pickupShort")}
              </button>
            ))}
          </div>
          {deliveryType === "PICKUP" ? (
            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-slate-900">{branch?.name}</p>
              <p className="mt-1 text-sm text-slate-600">{branch?.address}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{t("cart.branchHours")}: {branch?.workingHours || "—"}</p>
              <p className="mt-2 text-xs text-emerald-700">{t("cart.pickupHint")}</p>
            </section>
          ) : (
            <>
              <MapCheckoutSection
                street={address.street}
                apartment={address.apartment}
                floor={address.floor}
                intercom={address.intercom}
                lat={address.lat}
                lng={address.lng}
                city={branch?.city || DELIVERY_CITY}
                inputRef={addressRef}
                entrance={address.entrance || ""}
                landmark={address.landmark || ""}
                invalid={showProblem("address")}
                onBlur={() => setTouched((current) => ({ ...current, address: true }))}
                onChange={(next) => setSavedAddress(next)}
              />
              {showProblem("address") && <p className="text-xs font-medium text-red-600">{fieldProblems.address}</p>}
            </>
          )}

          {hasPrescriptionItems && (
            prescription?.fileName ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                {rxPreview ? (
                  <img src={rxPreview} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-xl bg-white text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {t("cart.rxUploaded")}
                  </p>
                  <p className="truncate text-xs text-emerald-700">{prescription.fileName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPrescription(null)}
                  className="h-10 rounded-xl px-3 text-sm font-bold text-red-600"
                >
                  {t("cart.remove")}
                </button>
              </div>
            ) : (
              <label ref={rxRef} tabIndex={-1} className={`grid cursor-pointer place-items-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center outline-none ${showProblem("rx") ? "border-red-500 bg-red-50" : "border-red-200 bg-red-50"}`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  hidden
                  onChange={(event) => readRxFile(event.target.files?.[0])}
                />
                <UploadCloud className="h-7 w-7 text-red-500" />
                <strong className="text-sm text-red-700">{t("cart.rxTitle")}</strong>
                {rxNames.length > 0 && <span className="text-xs font-semibold text-red-700">{t("cart.rxFor", { names: rxNames.join(", ") })}</span>}
                <span className="text-xs text-red-600">{t("cart.rxHint")}</span>
                {showProblem("rx") && <span className="text-xs font-medium text-red-600">{fieldProblems.rx}</span>}
              </label>
            )
          )}

          <section className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:p-5">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              {t("cart.phone")}
              <span className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={phoneRef}
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  onBlur={() => {
                    setTouched((current) => ({ ...current, phone: true }));
                    const next = normalizePhoneInput(phone);
                    if (next) setPhone(next);
                  }}
                  placeholder="+998 90 123 45 67"
                  className={`h-12 w-full scroll-mb-40 rounded-xl border pl-10 pr-3 text-base font-normal outline-none ring-brand/30 focus:ring-2 md:text-sm ${
                    showProblem("phone") ? "border-red-500 bg-red-50" : "border-slate-200"
                  }`}
                />
              </span>
              {showProblem("phone") ? (
                <span className="text-xs font-medium text-red-600">
                  {phone && !phoneValid ? t("cart.phoneFormat") : fieldProblems.phone}
                </span>
              ) : null}
              {!token && (
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                  {t("cart.hint.auth")}
                  <button type="button" onClick={() => setLoginOpen(true)} className="h-8 rounded-lg bg-[#087B51] px-3 text-xs font-bold text-white">
                    {t("common.login")}
                  </button>
                </span>
              )}
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              {t("cart.name")}
              <span className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={nameRef}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, name: true }))}
                  placeholder={t("profile.enterName")}
                  className={`h-12 w-full scroll-mb-40 rounded-xl border pl-10 pr-3 text-base font-normal outline-none ring-brand/30 focus:ring-2 md:text-sm ${showProblem("name") ? "border-red-500" : "border-slate-200"}`}
                />
              </span>
              {showProblem("name") && <span className="text-xs font-medium text-red-600">{fieldProblems.name}</span>}
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              {t("cart.promo")}
              {!token ? (
                <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
                  {t("cart.promoLogin")}
                  <button type="button" onClick={() => setLoginOpen(true)} className="h-8 rounded-lg bg-[#087B51] px-3 text-xs font-bold text-white">
                    {t("common.login")}
                  </button>
                </span>
              ) : (
              <span className="flex gap-2">
                <input
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    event.stopPropagation();
                    applyPromo();
                  }}
                  className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-base font-normal uppercase outline-none ring-brand/30 focus:ring-2 md:text-sm"
                />
                <LoadingButton
                  type="button"
                  disabled={promoBusy || !promoInput.trim()}
                  loading={promoBusy}
                  loadingText={t("common.applying")}
                  onClick={applyPromo}
                  className="h-12 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {t("cart.promoApply")}
                </LoadingButton>
              </span>
              )}
              {promo?.code && <span className="text-xs font-medium text-emerald-700">{t("cart.promoOk", { code: promo.code })}</span>}
              {promoError && <span className="text-xs font-medium text-red-600">{promoError}</span>}
            </label>
          </section>
        </div>

        <aside className="mt-3 grid gap-3 lg:col-span-5 lg:mt-0 lg:sticky lg:top-24">
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {pendingOrder
                ? expired
                  ? t("cart.holdExpired")
                  : t("cart.holdLeft", { time: timerLabel })
                : t(holdKey, { minutes: holdMinutes })}
            </span>
          </div>

          <section className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm md:p-5">
            <p className="mb-2 text-sm font-bold text-slate-900">{t("cart.payment")}</p>
            <div className="grid gap-2">
              {!shopReady && (
                <>
                  <SkeletonPulse className="h-12 w-full" />
                  <SkeletonPulse className="h-12 w-full" />
                </>
              )}
              {shopReady && paymentOptions.map((option) => (
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
                  <span className="text-sm font-semibold text-slate-800">{option.labelKey ? t(option.labelKey) : option.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{t("cart.products")}</span>
              <strong className="tabular-nums text-slate-900">{formatSom(totalAmount)}</strong>
            </div>
            {!shopReady && <SkeletonPulse className="mt-3 h-16 w-full" />}
            {shopReady && deliveryType === "DELIVERY" && (
              <div className="mt-3">
                <p className="text-xs text-slate-600">
                  {totalAmount >= shop.freeDeliveryFrom
                    ? t("cart.freeNow")
                    : t("cart.freeLeft", { amount: formatSom(shop.freeDeliveryFrom - totalAmount) })}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-brand" style={{ width: `${Math.min(100, (totalAmount / shop.freeDeliveryFrom) * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{t("cart.zone", { city: branch?.city || DELIVERY_CITY, eta: DELIVERY_ETA })}</p>
              </div>
            )}
            {deliveryType === "PICKUP" ? (
              <div className="mt-2 text-sm">
                <span className="font-semibold text-slate-800">{t("cart.pickupFree")}</span>
                {paymentMethod === "cash" && hasPrescriptionItems && (
                  <p className="mt-1 text-xs font-normal text-slate-600">{t("cart.holdCashPickup")}</p>
                )}
              </div>
            ) : (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">{t("cart.delivery")}</span>
                <strong className="text-slate-900">{totals.deliveryFee === 0 ? t("cart.freeNow") : t("cart.deliveryValue", { fee: formatSom(totals.deliveryFee) })}</strong>
              </div>
            )}
            {totals.discount > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">{t("order.amount.discount")}</span>
                <strong className="tabular-nums text-emerald-700">−{formatSom(totals.discount)}</strong>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="font-semibold text-slate-700">{t("cart.total")}</span>
              <strong className="text-lg font-bold tabular-nums text-slate-900">
                {formatSom(totals.totalAmount)}
              </strong>
            </div>
            {stockChecking && <p className="mt-3 text-xs font-semibold text-slate-500">{t("cart.stockChecking")}</p>}
            {stockError && <p className="mt-3 text-xs font-semibold text-red-600">{stockError}</p>}
            {error && (
              <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
            {attempted && !canCheckout && checkoutHints.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-amber-800">
                {checkoutHints.map((hint) => (
                  <li key={hint} className="flex items-start gap-1.5">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {hint}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 hidden lg:block">{payButton(submitLabel)}</div>
          </section>
        </aside>
      </div>

      <div
        className={`fixed inset-x-0 z-20 border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] lg:hidden ${keyboard ? "hidden" : ""}`}
        style={{ bottom: "calc(var(--bottom-nav-h) + var(--tg-safe-bottom, env(safe-area-inset-bottom)))" }}
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <div className="min-w-0 shrink">
            <p className="truncate text-[11px] font-semibold text-slate-500">
              {(paymentOptions.find((option) => option.id === paymentMethod)?.labelKey
                ? t(paymentOptions.find((option) => option.id === paymentMethod).labelKey)
                : paymentOptions.find((option) => option.id === paymentMethod)?.label) || t("cart.payment")}
              {" · "}
              {deliveryType === "PICKUP" ? t("cart.pickupFree") : totals.deliveryFee === 0 ? t("cart.freeNow") : formatSom(totals.deliveryFee)}
            </p>
            <p className="text-sm font-extrabold tabular-nums text-slate-900">{t("cart.total")}: {formatSom(totals.totalAmount)}</p>
          </div>
          <div className="min-w-0 flex-1">{payButton(submitShort)}</div>
        </div>
      </div>
    </form>
    {confirmClear && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onClick={() => setConfirmClear(false)}>
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm" onClick={(event) => event.stopPropagation()}>
          <p className="text-sm font-semibold text-slate-800">{t("cart.clearConfirm")}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setConfirmClear(false)} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => {
                clearCart();
                setConfirmClear(false);
              }}
              className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-bold text-white"
            >
              {t("cart.clear")}
            </button>
          </div>
        </div>
      </div>
    )}
    <AuthLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </>
  );
}
