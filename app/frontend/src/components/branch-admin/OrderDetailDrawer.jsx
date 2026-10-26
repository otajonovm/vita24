import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatSom, orderStatusLabel } from "../../lib/format";
import { fetchBranchOrder, markCashReceived, savePharmacistNote, undoOrderStatus, updateBranchOrderStatus } from "../../services/api";
import { ErrorState, LoadingButton, SkeletonLines } from "../ui";
import OrderCard from "./OrderCard";
import { apiError, printHtml } from "./panelShared";

const PAYMENT = { PAYME: "Payme", CLICK: "Click", CASH: "Naqd", PENDING: "Kutilmoqda", COMPLETED: "To'langan", FAILED: "Muvaffaqiyatsiz" };

export default function OrderDetailDrawer({ orderId, readOnly = false, onClose, onToast }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderId, onClose]);

  function load() {
    if (!orderId) return undefined;
    let active = true;
    const controller = new AbortController();
    setOrder(null);
    setNote("");
    setError("");
    setLoading(true);
    fetchBranchOrder(orderId, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setOrder(data);
        setNote(data.pharmacistNote || "");
      })
      .catch((err) => {
        if (!active || err?.name === "AbortError" || err?.code === "ERR_CANCELED") return;
        setError(apiError(err, t("panel.loadFailed", "Ro'yxat yuklanmadi")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }

  useEffect(() => load(), [orderId]);

  if (!orderId) return null;
  const address = encodeURIComponent(order?.deliveryAddress || "");

  function print(kind) {
    if (!order) return;
    const page = kind === "receipt" ? "80mm auto" : "A5";
    const items = (order.items || []).map((item) => `<p>${item.name} × ${item.quantity} — ${formatSom(item.lineTotal)}</p>`).join("");
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(order.orderNumber)}`;
    const name = order.customerName || order.user?.name || order.customerPhone;
    let body = `<h1>${order.branch?.name || "Vita24"}</h1><p>${order.branch?.address || ""}</p><p>${order.orderNumber}</p><p>${formatDateTime(order.createdAt)}</p>`;
    if (kind === "pick") body += items;
    if (kind === "courier") body += `<p>${name}</p><p>${order.customerPhone}</p><p>${order.deliveryAddress || ""}</p><p>${formatSom(order.totalAmount)} · ${PAYMENT[order.payment?.provider] || ""}</p><img alt="" src="${qr}" width="120" height="120" />`;
    if (kind === "receipt") {
      body += `${items}<p>Yetkazib berish: ${formatSom(order.deliveryFee)}</p><p><b>Jami: ${formatSom(order.totalAmount)}</b></p><p>To'lov: ${PAYMENT[order.payment?.provider] || "—"}</p><img alt="" src="${qr}" width="120" height="120" />`;
    }
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${page};margin:6mm}body{font-family:sans-serif;font-size:12px;margin:0}h1{font-size:16px;margin:0 0 6px}p{margin:2px 0}</style></head><body>${body}</body></html>`);
  }

  async function run(action) {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      const updated = await action();
      setOrder(updated);
      setNote(updated.pharmacistNote || "");
      onToast("Saqlandi");
    } catch (err) {
      onToast(apiError(err, "Amal bajarilmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (readOnly || savingNote || !order) return;
    setSavingNote(true);
    try {
      const updated = await savePharmacistNote(order.id, note);
      setOrder(updated);
      onToast(t("panel.saved", "Saqlandi"));
    } catch (err) {
      onToast(apiError(err, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500">{t("panel.close", "Yopish")}</button>
        </div>
        {loading && <SkeletonLines rows={8} />}
        {!loading && error && (
          <ErrorState title={error} onRetry={load} onClose={onClose} closeLabel={t("panel.close", "Yopish")} />
        )}
        {!loading && !error && order && (
          <div className="grid gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold">{order.orderNumber}</h2>
                <p className="text-sm text-slate-500">{formatDateTime(order.createdAt)} · {orderStatusLabel(order)}</p>
              </div>
            </div>
            <p className="text-sm">{order.customerName || order.user?.name || order.customerPhone}</p>
            <a className="text-sm font-bold text-brand" href={`tel:${order.customerPhone}`}>{t("panel.call", "Qo'ng'iroq")}: {order.customerPhone}</a>
            <p className="text-sm text-slate-700">{order.deliveryAddress}</p>
            <div className="flex gap-3 text-sm font-semibold">
              <a className="text-brand" target="_blank" rel="noreferrer" href={`https://yandex.uz/maps/?text=${address}`}>{t("panel.yandex", "Yandex xarita")}</a>
              <a className="text-brand" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${address}`}>{t("panel.google", "Google xarita")}</a>
            </div>
            {order.notes && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm">{t("panel.customerNote", "Mijoz izohi")}: {order.notes}</p>}
            <ul className="grid gap-1 text-sm">
              {(order.items || []).map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <span>{item.name}{item.dosageForm ? `, ${item.dosageForm}` : ""} × {item.quantity}</span>
                  <span className="tabular-nums">{formatSom(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="grid gap-1 text-sm">
              <p className="flex justify-between"><span>Dorilar jami</span><span>{formatSom(order.subtotal)}</span></p>
              <p className="flex justify-between"><span>Yetkazib berish</span><span>{formatSom(order.deliveryFee)}</span></p>
              <p className="flex justify-between font-extrabold"><span>Umumiy</span><span>{formatSom(order.totalAmount)}</span></p>
              <p>{t("panel.payment", "To'lov")}: {PAYMENT[order.payment?.provider] || "—"} · {PAYMENT[order.payment?.status] || "—"}</p>
            </div>
            {order.refundStatus === "PENDING" && <p className="text-sm text-amber-800">{t("panel.refundPending", "To'lov qaytarilishi kutilmoqda")}</p>}
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">{t("panel.history", "Holat tarixi")}</p>
              <ul className="mt-1 grid gap-1 text-sm">
                {(order.history || []).map((row) => (
                  <li key={row.id}>{formatDateTime(row.createdAt)} · {row.userName || (row.kind === "system" ? "Tizim" : "—")} · {row.kind === "undo" ? "Ortga qaytarildi" : `${orderStatusLabel({ status: row.fromStatus })} → ${orderStatusLabel({ status: row.toStatus })}`}{row.note && row.note !== "undo" ? ` · ${row.note}` : ""}</li>
                ))}
              </ul>
            </div>
            <label className="grid gap-1 text-sm">
              {t("panel.note", "Ichki izoh")}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                readOnly={readOnly}
                className="min-h-20 rounded-xl border border-slate-200 p-2 disabled:bg-slate-50"
                disabled={readOnly}
              />
            </label>
            {!readOnly && (
              <LoadingButton
                type="button"
                loading={savingNote}
                loadingText={t("common.saving")}
                onClick={saveNote}
                className="h-10 rounded-xl bg-brand text-sm font-bold text-white disabled:opacity-50"
              >
                {t("panel.save", "Saqlash")}
              </LoadingButton>
            )}
            <OrderCard
              order={order}
              busy={busy}
              readOnly={readOnly}
              onOpen={() => {}}
              onReview={() => {}}
              onStatus={(current, payload) => run(() => updateBranchOrderStatus(current.id, payload))}
              onUndo={(current) => run(() => undoOrderStatus(current.id))}
              onCash={(current) => run(() => markCashReceived(current.id))}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => print("pick")} className="h-10 rounded-xl border px-3 text-sm font-semibold">{t("panel.printPick", "Yig'ish varag'i")}</button>
              <button type="button" onClick={() => print("courier")} className="h-10 rounded-xl border px-3 text-sm font-semibold">{t("panel.printCourier", "Kuryer varag'i")}</button>
              <button type="button" onClick={() => print("receipt")} className="h-10 rounded-xl border px-3 text-sm font-semibold">{t("panel.printReceipt", "Chek")}</button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
