import { orderStatusLabel, STATUS_TONES } from "../../lib/format";

export const REJECT_CHIPS = [
  ["NO_STAMP", "Muhr yo'q"],
  ["NO_SIGNATURE", "Shifokor imzosi yo'q"],
  ["EXPIRED", "Retsept muddati o'tgan"],
  ["UNREADABLE", "O'qib bo'lmaydi"],
  ["WRONG_DRUG", "Boshqa dori yozilgan"],
  ["WRONG_DOSE", "Dozasi mos emas"],
  ["OTHER", "Boshqa"],
];

export const CANCEL_REASONS = [
  ["OUT_OF_STOCK", "Dori tugadi"],
  ["CUSTOMER_DECLINED", "Mijoz voz kechdi"],
  ["UNDELIVERABLE", "Manzilga yetkazib bo'lmadi"],
  ["OTHER", "Boshqa"],
];

export const PAYMENT_LABELS = {
  CASH: "Naqd",
  CLICK: "Click",
  PAYME: "Payme",
};

export const STOCK_REASONS = [
  ["kirim", "Kirim"],
  ["sotildi", "Sotildi (oflayn)"],
  ["buzildi", "Buzildi yoki muddati o'tdi"],
  ["inventarizatsiya", "Inventarizatsiya"],
  ["boshqa", "Boshqa"],
];

export const ORDER_FILTERS = [
  ["", "panel.filters.all", "Barchasi"],
  ["review", "panel.filters.review", "Retsept tekshiruvi"],
  ["WAITING_PAYMENT", "panel.filters.payment", "To'lov kutilmoqda"],
  ["PAID", "panel.filters.paid", "To'langan"],
  ["PREPARING", "panel.filters.preparing", "Yig'ilmoqda"],
  ["READY", "panel.filters.ready", "Tayyor"],
  ["DELIVERING", "panel.filters.delivering", "Yetkazilmoqda"],
  ["COMPLETED", "panel.filters.done", "Yakunlangan"],
  ["rejected", "panel.filters.rejected", "Rad etilgan"],
  ["cancelled", "panel.filters.cancelled", "Bekor qilingan"],
];

export function apiError(error, fallback) {
  return error?.response?.data?.error?.message || error?.message || fallback;
}

export function beep() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.05, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.18);
  osc.onended = () => ctx.close().catch(() => {});
}

export function deadlineMs(order) {
  if (["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(order?.status)) {
    return new Date(order.createdAt).getTime() + 2 * 60 * 60 * 1000;
  }
  if (order?.status === "WAITING_PAYMENT" && order.reservedUntil) {
    return new Date(order.reservedUntil).getTime();
  }
  return null;
}

export function formatRemain(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function timerTone(left) {
  if (left < 3 * 60 * 1000) return "text-red-700";
  if (left < 10 * 60 * 1000) return "text-amber-700";
  return "text-slate-600";
}

export function stockInputError(value) {
  if (value === "" || value == null) return "Qoldiqni kiriting";
  const text = String(value).trim();
  if (text.startsWith("-")) return "Qoldiq manfiy bo'lishi mumkin emas";
  if (!/^\d+$/.test(text)) return "Qoldiq butun son bo'lishi kerak";
  if (Number(text) > 100000) return "Qoldiq 100000 dan oshmasligi kerak";
  return "";
}

export function canDecide(order) {
  return ["PENDING_PRESCRIPTION", "PENDING_BRANCH"].includes(order?.status);
}

export function canReview(order) {
  return canDecide(order);
}

export function paymentLabel(provider) {
  return PAYMENT_LABELS[String(provider || "").toUpperCase()] || provider || "—";
}

export function printHtml(html) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow;
  win.focus();
  win.print();
  setTimeout(() => iframe.remove(), 1500);
}

export function StatusBadge({ order }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_TONES[order.status] || "border-slate-200 text-slate-600"}`}>
      {orderStatusLabel(order)}
    </span>
  );
}

export function PanelToast({ message }) {
  if (!message) return null;
  return (
    <p className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm" role="status">
      {message}
    </p>
  );
}
