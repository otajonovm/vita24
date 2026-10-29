import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatSom } from "../../lib/format";
import { LoadingButton } from "../ui";
import { CANCEL_REASONS, StatusBadge, canDecide, deadlineMs, formatRemain, paymentLabel, timerTone } from "./panelShared";

const NEXT = {
  PAID: ["PREPARING", "panel.startPrep", "Yig'ishni boshlash"],
  PREPARING: ["READY", "panel.markReady", "Tayyor"],
  READY: ["DELIVERING", "panel.toCourier", "Kuryerga berish"],
  DELIVERING: ["COMPLETED", "panel.delivered", "Yetkazildi"],
};

const CANCELABLE = ["PENDING_PRESCRIPTION", "PENDING_BRANCH", "WAITING_PAYMENT", "PAID", "PREPARING", "READY", "DELIVERING"];

export default function OrderCard({ order, highlight, busy, readOnly = false, couriers = [], onOpen, onReview, onStatus, onUndo, onCash, onAssign }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmDone, setConfirmDone] = useState(false);
  const end = deadlineMs(order);
  const left = end ? end - now : null;
  let next = order.status === "READY" && order.deliveryType === "PICKUP"
    ? ["COMPLETED", "panel.pickedUp", "Mijoz olib ketdi"]
    : NEXT[order.status];
  if (order.deliveryType !== "PICKUP" && order.status === "READY") next = null;
  if (order.courierStage === "PICKED_UP") next = null;
  const canCancel = CANCELABLE.includes(order.status);
  const undoLeft = order.undoUntil ? new Date(order.undoUntil).getTime() - now : 0;
  const provider = String(order.payment?.provider || "").toUpperCase();
  const paidOnline = order.payment?.status === "COMPLETED" && provider !== "CASH";
  const cashDue = provider === "CASH" && order.payment?.status !== "COMPLETED" && ["PREPARING", "READY", "DELIVERING"].includes(order.status) && (order.deliveryType === "PICKUP" || !order.courierId);
  const name = order.customerName || order.user?.name || order.customerPhone;
  const noteRequired = reason === "OTHER" && !note.trim();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setCancelOpen(false);
    setConfirmDone(false);
    setReason("");
    setNote("");
  }, [order.id, order.status, order.refundStatus, order.cancelReason, order.undoUntil]);

  return (
    <article className={`grid gap-3 rounded-2xl border bg-white p-4 shadow-sm ${highlight ? "border-brand ring-2 ring-brand/30" : "border-slate-100"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-extrabold">{order.orderNumber}</h2>
            {highlight && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">{t("panel.new", "Yangi")}</span>}
            <StatusBadge order={order} />
            {order.refundStatus === "PENDING" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Pul qaytarilishi kutilmoqda</span>
            )}
            {order.refundStatus === "DONE" && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Pul qaytarildi</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{name} · {order.customerPhone}</p>
          <p className="text-xs text-slate-400">{formatDateTime(order.createdAt)} · {paymentLabel(provider)}{order.courier?.name ? ` · ${order.courier.name}` : ""}</p>
        </div>
        <p className="text-sm font-extrabold tabular-nums">{formatSom(order.totalAmount)}</p>
      </div>
      {left != null && (
        <p className={`text-sm font-bold tabular-nums ${timerTone(left)}`}>
          {order.status === "WAITING_PAYMENT" ? t("panel.payLeft", "To'lovga qolgan vaqt") : t("panel.reviewLeft", "Tekshiruvga qolgan vaqt")}: {formatRemain(left)}
        </p>
      )}
      {order.cancelReason && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{t("panel.reason", "Sabab")}: {order.cancelReason}</p>}
      <ul className="grid gap-1 text-sm text-slate-700">
        {(order.items || []).slice(0, 3).map((item) => (
          <li key={item.id}>{item.name} × {item.quantity}</li>
        ))}
      </ul>
      {!readOnly && order.deliveryType !== "PICKUP" && order.status === "READY" && ["UNASSIGNED", "ASSIGNED", "FAILED"].includes(order.courierStage || "UNASSIGNED") && (
        <label className="grid gap-1 text-sm">
          {t("courier.panel.assign")}
          <select
            value={order.courierId || ""}
            disabled={busy}
            onChange={(event) => event.target.value && onAssign?.(order, event.target.value)}
            className="h-11 rounded-xl border border-slate-200 px-3"
          >
            <option value="">{t("courier.panel.none")}</option>
            {couriers.filter((courier) => courier.active !== false && courier.status !== "SUSPENDED").map((courier) => (
              <option key={courier.id} value={courier.id}>{courier.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpen(order)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold">{t("panel.detail", "Tafsilot")}</button>
        {order.prescription && (
          <button type="button" onClick={() => onReview(order)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
            {!readOnly && canDecide(order) ? t("panel.reviewRx", "Retseptni tekshirish") : t("panel.viewRx", "Retseptni ko'rish")}
          </button>
        )}
        {!readOnly && next && !(next[0] === "COMPLETED" && cashDue) && (
          <LoadingButton
            type="button"
            loading={busy}
            loadingText={t("common.saving")}
            onClick={() => (next[0] === "COMPLETED" ? setConfirmDone(true) : onStatus(order, { status: next[0] }))}
            className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {t(next[1], next[2])}
          </LoadingButton>
        )}
        {!readOnly && cashDue && (
          <LoadingButton type="button" loading={busy} loadingText={t("common.saving")} onClick={() => onCash(order)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold disabled:opacity-50">
            Naqd olindi
          </LoadingButton>
        )}
        {!readOnly && canCancel && (
          <button type="button" disabled={busy} onClick={() => setCancelOpen(true)} className="h-10 rounded-xl px-3 text-sm font-semibold text-red-700 disabled:opacity-50">
            {t("panel.cancel", "Bekor qilish")}
          </button>
        )}
        {!readOnly && undoLeft > 0 && (
          <button type="button" disabled={busy} onClick={() => onUndo(order)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold disabled:opacity-50">
            {t("panel.undo", "Ortga qaytarish")} ({formatRemain(undoLeft)})
          </button>
        )}
      </div>
      {!readOnly && confirmDone && (
        <div className="grid gap-2 rounded-xl bg-slate-50 p-3">
          <p className="text-sm">{order.deliveryType === "PICKUP" ? t("panel.confirmPickup", "Mijoz buyurtmani olib ketganini tasdiqlaysizmi?") : t("panel.confirmDone", "Buyurtma yetkazilganini tasdiqlaysizmi?")}</p>
          <div className="flex gap-2">
            <LoadingButton
              type="button"
              loading={busy}
              loadingText={t("common.saving")}
              onClick={() => {
                setConfirmDone(false);
                onStatus(order, { status: "COMPLETED", confirm: true });
              }}
              className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {order.deliveryType === "PICKUP" ? t("panel.pickedUp", "Mijoz olib ketdi") : t("panel.delivered", "Yetkazildi")}
            </LoadingButton>
            <button type="button" onClick={() => setConfirmDone(false)} className="h-10 rounded-xl px-3 text-sm">Bekor</button>
          </div>
        </div>
      )}
      {!readOnly && cancelOpen && (
        <form
          className="grid gap-2 rounded-xl bg-slate-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reason || noteRequired || busy) return;
            setCancelOpen(false);
            onStatus(order, { status: "CANCELLED", reason, note });
          }}
        >
          {paidOnline && (
            <p className="text-sm font-semibold text-amber-800">Mijozga {formatSom(order.totalAmount)} qaytarilishi kerak</p>
          )}
          <div className="flex flex-wrap gap-2">
            {CANCEL_REASONS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setReason(id)} className={`rounded-full px-3 py-1 text-xs font-bold ${reason === id ? "bg-slate-900 text-white" : "bg-white"}`}>{label}</button>
            ))}
          </div>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={reason === "OTHER" ? "Izoh majburiy" : t("panel.extraNote", "Qo'shimcha izoh")} className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
          {noteRequired && <p className="text-xs text-red-600">Boshqa sabab uchun izoh yozing</p>}
          <div className="flex gap-2">
            <LoadingButton type="submit" loading={busy} disabled={!reason || noteRequired} loadingText={t("common.saving")} className="h-10 rounded-xl bg-red-600 px-3 text-sm font-bold text-white disabled:opacity-50">{t("panel.cancel", "Bekor qilish")}</LoadingButton>
            <button type="button" onClick={() => setCancelOpen(false)} className="h-10 rounded-xl px-3 text-sm">Bekor</button>
          </div>
        </form>
      )}
    </article>
  );
}
