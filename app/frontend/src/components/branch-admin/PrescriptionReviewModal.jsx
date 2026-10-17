import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import PrescriptionFile from "../prescriptions/PrescriptionFile";
import { REJECT_CHIPS, StatusBadge, canDecide } from "./panelShared";

function viewText(order) {
  if (order.status === "WAITING_PAYMENT") return "Mijoz to'lovni kutyapti";
  if (["PAID", "PREPARING", "READY"].includes(order.status)) return "To'langan, yig'ishga tayyor";
  if (order.status === "DELIVERING") return "Yetkazilmoqda";
  if (order.status === "COMPLETED") return "Yakunlangan";
  if (order.status === "CANCELLED" || order.prescription?.status === "REJECTED") {
    const reason = order.cancelReason || order.prescription?.rejectNote;
    return reason ? `Bekor qilingan: ${reason}` : "Bekor qilingan";
  }
  return "Bu buyurtma tasdiqni kutmayapti";
}

export default function PrescriptionReviewModal({
  order,
  orders,
  busy,
  onClose,
  onApprove,
  onReject,
  readOnly = false,
  onSelect,
  audience = "pharmacist",
}) {
  const { t } = useTranslation();
  const [chips, setChips] = useState([]);
  const [note, setNote] = useState("");
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [full, setFull] = useState(false);
  const [ask, setAsk] = useState(false);
  const review = canDecide(order);
  const queue = (orders || []).filter((item) => canDecide(item));
  const index = queue.findIndex((item) => item.id === order?.id);
  const otherNeedsNote = chips.includes("OTHER") && !note.trim();
  const rejectDisabled = !chips.length || otherNeedsNote;

  useEffect(() => {
    setChips([]);
    setNote("");
    setAsk(false);
    setZoom(1);
    setRotate(0);
  }, [order?.id]);

  useEffect(() => {
    function onFull() {
      setFull(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFull);
    return () => document.removeEventListener("fullscreenchange", onFull);
  }, []);

  useEffect(() => {
    function onKey(event) {
      const typing = event.target.matches("input, textarea");
      if (event.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
          return;
        }
        if (ask) {
          setAsk(false);
          return;
        }
        onClose();
        return;
      }
      if (typing) return;
      if (event.key === "Enter" && ask && review && !readOnly) {
        setAsk(false);
        onApprove(order);
        return;
      }
      if ((event.key === "a" || event.key === "A") && review && !readOnly) setAsk(true);
      if ((event.key === "r" || event.key === "R") && review && !readOnly) {
        if (!rejectDisabled) onReject(order, { rejectReasons: chips, rejectNote: note.trim() });
        else document.getElementById("rx-note")?.focus();
      }
      if (event.key === "ArrowRight" && queue[index + 1]) onSelect(queue[index + 1]);
      if (event.key === "ArrowLeft" && queue[index - 1]) onSelect(queue[index - 1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, queue, index, review, chips, note, ask, rejectDisabled]);

  if (!order) return null;

  function toggleChip(code) {
    setChips((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  function toggleFull() {
    const stage = document.querySelector(".rx-stage");
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stage?.requestFullscreen?.();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 md:items-center" onClick={onClose}>
      <div className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white md:max-h-[90vh] md:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-extrabold">{order.orderNumber}</h2>
            <StatusBadge order={order} />
          </div>
          <button type="button" onClick={onClose}>{t("panel.close", "Yopish")}</button>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 md:grid-cols-[1.4fr_1fr]">
          <div
            className="rx-stage relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100"
            onWheel={(event) => {
              if (!event.ctrlKey) return;
              event.preventDefault();
              setZoom((value) => Math.min(3, Math.max(1, value + (event.deltaY < 0 ? 0.1 : -0.1))));
            }}
          >
            <div className="flex h-full w-full items-center justify-center" style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}>
              <PrescriptionFile prescriptionId={order.prescription?.id} audience={audience} fileName={order.prescription?.fileName} />
            </div>
            <div className="absolute bottom-2 right-2 flex flex-wrap gap-2 rounded-xl bg-white/90 p-2 text-xs font-semibold">
              <button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>{t("panel.zoomIn", "Kattalashtirish")}</button>
              <button type="button" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>{t("panel.zoomOut", "Kichraytirish")}</button>
              <button type="button" onClick={() => setRotate((value) => value + 90)}>{t("panel.rotate", "Aylantirish")}</button>
              <button type="button" onClick={toggleFull}>{full ? "Ekrandan chiqish" : t("panel.fullscreen", "To'liq ekran")}</button>
            </div>
          </div>
          <div className="overflow-auto">
            <p className="text-xs font-bold uppercase text-slate-500">{t("panel.medicines", "Dorilar")}</p>
            <ul className="mt-2 grid gap-2 text-sm">
              {(order.items || []).map((item) => (
                <li key={item.id} className={item.isPrescription ? "rounded-xl bg-amber-50 px-2 py-1" : ""}>
                  {item.name}{item.dosageForm ? `, ${item.dosageForm}` : ""} × {item.quantity}
                  {item.isPrescription ? ` · ${t("panel.rxItem", "retseptli")}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="sticky bottom-0 grid gap-2 border-t border-slate-100 bg-white p-3">
          {review && !readOnly ? (
            <>
              <div className="flex flex-wrap gap-2">
                {REJECT_CHIPS.map(([code, label]) => (
                  <button key={code} type="button" onClick={() => toggleChip(code)} className={`rounded-full px-3 py-1 text-xs font-bold ${chips.includes(code) ? "bg-slate-900 text-white" : "bg-slate-100"}`}>{label}</button>
                ))}
              </div>
              <input id="rx-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={chips.includes("OTHER") ? "Izoh majburiy" : t("panel.extraNote", "Qo'shimcha izoh")} className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
              {otherNeedsNote && <p className="text-xs text-red-600">Boshqa sabab uchun izoh yozing</p>}
              {ask ? (
                <p className="text-sm font-semibold">Tasdiqlaysizmi? Enter — ha, Esc — yo'q</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy} onClick={() => setAsk(true)} className="h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">{t("panel.approve", "Tasdiqlash")}</button>
                  <button type="button" disabled={busy || rejectDisabled} onClick={() => onReject(order, { rejectReasons: chips, rejectNote: note.trim() })} className="h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50">{t("panel.rejectWithNote", "Izoh bilan rad etish")}</button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600">{viewText(order)}</p>
          )}
          <p className="text-xs text-slate-500">A — tasdiqlash, R — rad etish, ←/→ — keyingi, Esc — yopish</p>
        </div>
      </div>
    </div>
  );
}
