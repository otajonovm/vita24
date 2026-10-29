import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Phone } from "lucide-react";
import PageMeta from "../components/seo/PageMeta";
import AuthLoginModal from "../components/modals/AuthLoginModal";
import { customerCanCancel, getCustomerOrderView, isTerminalOrder } from "../lib/customerOrderView";
import { userError } from "../lib/userError";
import { formatClock, formatDateTime, formatSom, STATUS_TONES } from "../lib/format";
import { customerTimeline } from "../lib/orderTimeline";
import { DELIVERY_FEE } from "../lib/pricing";
import { ErrorState, LoadingButton, SkeletonLines } from "../components/ui";
import useLockBodyScroll from "../hooks/useLockBodyScroll";
import {
  cancelCustomerOrder,
  fetchCartAvailability,
  loadPrescriptionObjectUrl,
  mockPay,
  replaceOrderPrescription,
  uploadPrescription,
} from "../services/api";
import client from "../services/api";
import { useAuthStore } from "../store/useAuthStore";
import { useBranchStore } from "../store/useBranchStore";
import { useCartStore } from "../store/useCartStore";
import { useToastStore } from "../store/useToastStore";

const POLL_MS = 15000;

function statusKey(order) {
  return `${order?.status || ""}:${order?.courierStage || ""}:${order?.prescription?.status || ""}`;
}

function OrderPrescription({ prescriptionId, fileName }) {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useLockBodyScroll(open);

  useEffect(() => {
    if (!prescriptionId) return undefined;
    let active = true;
    let objectUrl = "";
    loadPrescriptionObjectUrl(prescriptionId, "customer")
      .then((next) => {
        if (!active) {
          URL.revokeObjectURL(next.url);
          return;
        }
        objectUrl = next.url;
        setFile(next);
      })
      .catch(() => {
        if (active) setError(t("order.rx.failed"));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [prescriptionId, t]);

  if (!prescriptionId) return <p className="text-sm text-slate-500">{t("common.missingRx")}</p>;
  if (error) return <ErrorState title={error} />;
  if (!file) return <SkeletonLines rows={3} />;

  const preview = file.type.includes("pdf") ? (
    <iframe title={fileName} src={file.url} className="pointer-events-none h-48 w-full rounded-xl bg-white" />
  ) : (
    <img src={file.url} alt={fileName} className="max-h-48 w-full rounded-xl object-contain" />
  );

  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        {preview}
        <span className="mt-1 inline-flex h-10 items-center text-xs font-bold text-[#087B51]">{t("order.rx.zoom")}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" onClick={() => setOpen(false)}>
          <div className="mx-auto flex w-full max-w-3xl justify-end pb-2" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} className="grid h-11 min-w-11 place-items-center rounded-xl bg-white px-3 text-sm font-bold text-slate-900">
              {t("order.rx.close")}
            </button>
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            {file.type.includes("pdf") ? (
              <>
                <iframe title={fileName} src={file.url} className="h-[70dvh] w-full shrink-0 rounded-2xl bg-white" />
                <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-slate-900">
                  {t("order.rx.open")}
                </a>
              </>
            ) : (
              <img src={file.url} alt={fileName} className="max-h-[80dvh] w-full rounded-2xl object-contain" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const telegramAuthPending = useAuthStore((state) => state.telegramAuthPending);
  const branch = useBranchStore((state) => state.branch);
  const addToCart = useCartStore((state) => state.addToCart);
  const pushToast = useToastStore((state) => state.push);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [reuploading, setReuploading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [now, setNow] = useState(Date.now());
  const seen = useRef("");

  useEffect(() => {
    if (!token || !id) {
      setLoading(false);
      if (!token && !telegramAuthPending) setLoginOpen(true);
      return undefined;
    }
    let active = true;
    const pull = async (announce) => {
      const response = await client.get(`/orders/${id}`, { audience: "customer" });
      if (!active) return null;
      const next = response.data?.data || response.data;
      const key = statusKey(next);
      if (announce && seen.current && seen.current !== key) {
        pushToast(t(getCustomerOrderView(next).titleKey));
      }
      seen.current = key;
      setOrder(next);
      return next;
    };
    setLoading(true);
    let timer = 0;
    pull(false)
      .then((next) => {
        if (!active || isTerminalOrder(next)) return;
        timer = window.setInterval(() => {
          pull(true)
            .then((fresh) => {
              if (isTerminalOrder(fresh)) window.clearInterval(timer);
            })
            .catch(() => {});
        }, POLL_MS);
      })
      .catch((err) => {
        if (active) setError(userError(err, t, "orders.loadFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id, token, telegramAuthPending, t, pushToast]);

  const payOnDelivery = ["CASH", "CARD_TERMINAL"].includes(String(order?.payment?.provider || "").toUpperCase());
  const reviewing = ["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(order?.status);
  const showPayTimer = order?.status === "WAITING_PAYMENT" && !payOnDelivery;
  const showReviewTimer = reviewing;

  useEffect(() => {
    if (!showReviewTimer && !showPayTimer) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showReviewTimer, showPayTimer]);

  const view = order ? getCustomerOrderView(order) : null;
  const remaining = order?.reservedUntil ? new Date(order.reservedUntil).getTime() - now : 0;
  const products = Number(order?.subtotal || 0);
  const discount = Number(order?.discount || 0);
  const deliveryFee = Number(order?.deliveryFee ?? (order?.deliveryType === "PICKUP" ? 0 : DELIVERY_FEE));
  const total = Number(order?.totalAmount || products + deliveryFee - discount);
  const canCancel = customerCanCancel(order?.status);

  function remember(next) {
    seen.current = statusKey(next);
    setOrder(next);
  }

  async function pay() {
    setPaying(true);
    setActionError("");
    try {
      remember(await mockPay(id));
    } catch (err) {
      setActionError(userError(err, t, "cart.payFailed"));
    } finally {
      setPaying(false);
    }
  }

  async function reupload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReuploading(true);
    setActionError("");
    try {
      const uploaded = await uploadPrescription(file);
      remember(await replaceOrderPrescription(id, {
        prescriptionFileKey: uploaded.fileKey,
        prescriptionFileName: uploaded.fileName || file.name,
      }));
    } catch (err) {
      setActionError(userError(err, t, "order.reupload"));
    } finally {
      setReuploading(false);
    }
  }

  async function submitCancel(event) {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (reason.length < 3) return;
    setCancelling(true);
    setActionError("");
    try {
      const updated = await cancelCustomerOrder(id, reason);
      remember(updated);
      setCancelOpen(false);
      pushToast(t("order.status.cancelled"));
    } catch (err) {
      setActionError(userError(err, t, "order.cancel.action"));
    } finally {
      setCancelling(false);
    }
  }

  async function reorder() {
    if (!branch?.id) {
      pushToast(t("order.reorder.pickBranch"));
      return;
    }
    setReordering(true);
    try {
      const ids = (order.items || []).map((item) => item.medicineId).filter(Boolean);
      const stocks = await fetchCartAvailability(branch.id, ids);
      const byId = new Map(stocks.map((row) => [row.id, row]));
      const missing = [];
      let added = 0;
      for (const item of order.items || []) {
        const stock = byId.get(item.medicineId);
        const medicine = {
          id: item.medicineId,
          name: item.name,
          price: stock?.price ?? item.unitPrice,
          stockCount: Number(stock?.available ?? 0),
          available: Number(stock?.available ?? 0),
          isPrescription: Boolean(item.isPrescription),
          dosageUnit: "tabletka",
        };
        const available = Number(medicine.available ?? medicine.stockCount ?? 0);
        const want = Number(item.quantity) || 0;
        const qty = Math.min(want, Math.max(0, available));
        if (!stock || qty < 1) {
          missing.push(item.name || item.medicineId);
          continue;
        }
        const unit = medicine.dosageUnit || "tabletka";
        const ok = addToCart(medicine, branch.id, unit, qty);
        if (!ok) {
          missing.push(item.name || item.medicineId);
          continue;
        }
        added += qty;
        if (qty < want) missing.push(item.name || item.medicineId);
      }
      const names = [...new Set(missing)].join(", ");
      if (names) pushToast(t("order.reorder.missing", { names }));
      if (added > 0) navigate("/cart");
      else if (!names) pushToast(t("order.reorder.none"));
    } catch {
      pushToast(t("order.reorder.failed"));
    } finally {
      setReordering(false);
    }
  }

  const timeline = order ? customerTimeline(order) : [];
  const phone = String(order?.branch?.phone || "").trim();
  const tel = phone.replace(/[^\d+]/g, "");

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <PageMeta title={t("order.metaTitle")} description={t("order.history")} path={`/orders/${id}`} />
      <p className="text-xs font-bold uppercase tracking-wide text-[#087B51]">{t("orders.title")}</p>
      {(loading || (telegramAuthPending && !token)) && <div className="mt-3"><SkeletonLines rows={6} /></div>}
      {telegramAuthPending && !token && <p className="mt-3 text-sm font-semibold text-slate-600">{t("common.signingIn")}</p>}
      {!token && !telegramAuthPending && <p className="mt-3 text-sm text-slate-600">{t("orders.login")}</p>}
      {error && (
        <div className="mt-3">
          <ErrorState
            title={error}
            onRetry={() => {
              setLoading(true);
              setError("");
              client
                .get(`/orders/${id}`, { audience: "customer" })
                .then((response) => setOrder(response.data?.data || response.data))
                .catch((err) => setError(userError(err, t, "orders.loadFailed")))
                .finally(() => setLoading(false));
            }}
          />
        </div>
      )}
      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
      {order && view && (
        <>
          <h1 className="mt-1 text-2xl font-extrabold">{order.orderNumber}</h1>
          <p className="mt-2 text-sm text-slate-500">{formatDateTime(order.createdAt)}</p>
          <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${STATUS_TONES[view.showReupload ? "CANCELLED" : order.status] || ""}`}>
            {t(view.titleKey)}
          </p>
          {order.courier?.name && (
            <p className="mt-3 text-sm">
              {t("courier.customer.courier")}: {order.courier.name}{" "}
              <a className="font-bold text-brand" href={`tel:${order.courier.phone}`}>{order.courier.phone}</a>
            </p>
          )}
          {view.showReupload && (
            <div className="mt-3 grid gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>{t("order.status.rxRejected")}</p>
              {view.customerReason ? (
                <p>{t("order.rejectReason")}: {view.customerReason}</p>
              ) : (
                <ul className="grid gap-1">
                  {view.reasons.map((reason) => (
                    <li key={`${reason.code}-${reason.note || ""}`}>
                      {t(`order.reject.${reason.code}`, reason.code)}
                      {reason.note ? `: ${reason.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              <label className="inline-flex h-10 w-fit cursor-pointer items-center rounded-xl bg-white px-3 text-sm font-bold text-red-700">
                {reuploading ? t("orders.loading") : t("order.reupload")}
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" disabled={reuploading} onChange={reupload} />
              </label>
            </div>
          )}
          {view.cancelReason && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {t("order.cancelReason")}: {view.cancelReason}
            </p>
          )}
          {order.refundStatus === "PENDING" && (
            <p className="mt-2 text-sm text-amber-800">{t("order.refundPending")}</p>
          )}
          {view.nextStepKey && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-bold">{t("order.next.label")}: </span>
              {t(view.nextStepKey)}
            </p>
          )}
          {view.reservationKey && <p className="mt-3 text-sm text-slate-600">{t(view.reservationKey)}</p>}
          {showReviewTimer && remaining > 0 && (
            <p className="mt-1 text-sm font-bold tabular-nums text-amber-800">{t("order.timer.review", { time: formatClock(remaining) })}</p>
          )}
          {showPayTimer && remaining > 0 && (
            <p className="mt-1 text-sm font-bold tabular-nums text-amber-800">{t("order.timer.payment", { time: formatClock(remaining) })}</p>
          )}

          <h2 className="mt-5 text-sm font-extrabold text-slate-900">{t("order.history")}</h2>
          <ol className="mt-2 grid gap-2">
            {timeline.map((point) => (
              <li key={point.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-800">{t(point.key)}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{formatDateTime(point.at)}</span>
              </li>
            ))}
          </ol>

          {order.deliveryType === "PICKUP" ? (
            <div className="mt-4 grid gap-1 text-sm text-slate-700">
              <p>
                {t("order.pickupAddress", {
                  place: [order.branch?.name, order.branch?.address].filter(Boolean).join(", "),
                })}
              </p>
              {phone && <p>{t("order.phone")}: {phone}</p>}
              {order.branch?.workingHours && <p>{t("order.hours")}: {order.branch.workingHours}</p>}
            </div>
          ) : (
            order.branch?.name && (
              <p className="mt-4 text-sm text-slate-700">
                {t("order.branch")}: {order.branch.name}
                {phone ? ` · ${phone}` : ""}
              </p>
            )
          )}
          {phone && (
            <a href={`tel:${tel}`} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-soft px-3 text-sm font-bold text-brand">
              <Phone className="h-4 w-4" />
              {t("order.call")}
            </a>
          )}
          {order.deliveryType !== "PICKUP" && order.deliveryAddress && (
            <p className="mt-2 text-sm text-slate-700">{t("order.address")}: {order.deliveryAddress}</p>
          )}

          {order.prescription?.id && (
            <OrderPrescription prescriptionId={order.prescription.id} fileName={order.prescription.fileName || t("order.reupload")} />
          )}

          <ul className="mt-4 grid gap-2">
            {(order.items || []).map((item) => (
              <li key={item.id || item.medicineId} className="flex justify-between gap-3 text-sm">
                <span>{item.name} × {item.quantity}</span>
                <span className="tabular-nums">{formatSom(item.lineTotal ?? item.unitPrice * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-1 border-t border-slate-100 pt-3 text-sm">
            <p className="flex justify-between"><span>{t("order.amount.medicines")}</span><span className="tabular-nums">{formatSom(products)}</span></p>
            {view.showDeliveryFee && (
              <p className="flex justify-between"><span>{t("order.amount.delivery")}</span><span className="tabular-nums">{formatSom(deliveryFee)}</span></p>
            )}
            <p className="flex justify-between"><span>{t("order.amount.discount")}</span><span className="tabular-nums">{formatSom(discount)}</span></p>
            <p className="flex justify-between text-base font-extrabold"><span>{t("order.amount.total")}</span><span className="tabular-nums">{formatSom(total)}</span></p>
          </div>
          {view.paymentKey && (
            <p className="mt-3 text-sm text-slate-600">{t("order.pay.label")}: {t(view.paymentKey)}</p>
          )}
          {view.prescriptionKey && <p className="mt-1 text-sm text-slate-600">{t(view.prescriptionKey)}</p>}
          {view.showPay && (
            <LoadingButton type="button" loading={paying} loadingText={t("cart.paying")} onClick={pay} className="mt-4 h-12 rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white disabled:opacity-50">
              {`${formatSom(total)} ${t("order.pay.label")}`}
            </LoadingButton>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {isTerminalOrder(order) && (
              <LoadingButton type="button" loading={reordering} loadingText={t("common.loading")} onClick={reorder} className="h-11 rounded-xl border border-brand/20 bg-brand-soft text-sm font-bold text-brand disabled:opacity-50">
                {view.showReupload ? t("order.reorderRx") : t("order.reorder")}
              </LoadingButton>
            )}
            {canCancel && (
              <button type="button" onClick={() => setCancelOpen(true)} className="h-11 rounded-xl border border-red-200 text-sm font-bold text-red-700">
                {t("order.cancel.action")}
              </button>
            )}
          </div>
          {cancelOpen && (
            <form onSubmit={submitCancel} className="mt-3 grid gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{t("order.cancel.confirm")}</p>
              <label className="grid gap-1 text-xs font-semibold text-red-800">
                {t("order.cancel.reason")}
                <textarea
                  required
                  minLength={3}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  className="min-h-20 rounded-xl border border-red-200 bg-white p-2 text-base font-normal text-slate-800 md:text-sm"
                />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCancelOpen(false)} className="h-10 rounded-xl bg-white px-3 text-sm font-bold text-slate-700">
                  {t("order.cancel.back")}
                </button>
                <LoadingButton type="submit" loading={cancelling} disabled={cancelReason.trim().length < 3} loadingText={t("common.saving")} className="h-10 rounded-xl bg-red-600 px-3 text-sm font-bold text-white disabled:opacity-50">
                  {t("order.cancel.submit")}
                </LoadingButton>
              </div>
            </form>
          )}
        </>
      )}
      <Link to="/orders" className="mt-4 inline-block text-sm font-bold text-[#087B51]">{t("order.back")}</Link>
      <AuthLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSuccess={() => setLoginOpen(false)} />
    </section>
  );
}
