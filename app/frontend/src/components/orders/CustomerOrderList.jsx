import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { getCustomerOrderView, isTerminalOrder } from "../../lib/customerOrderView";
import { formatDateTime, formatSom, STATUS_TONES } from "../../lib/format";
import { DELIVERY_FEE } from "../../lib/pricing";
import { fetchCustomerOrders } from "../../services/api";
import { useAuthStore } from "../../store/useAuthStore";
import { useToastStore } from "../../store/useToastStore";

const POLL_MS = 15000;

function statusKey(order) {
  return `${order.status}:${order.prescription?.status || ""}`;
}

function itemPreview(items) {
  const names = (items || []).map((item) => item.name).filter(Boolean);
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  return { shown: shown.join(", "), rest };
}

export default function CustomerOrderList({ orders, onOrders }) {
  const { t } = useTranslation();
  const phone = useAuthStore((state) => state.user?.phone);
  const pushToast = useToastStore((state) => state.push);
  const seen = useRef(null);

  useEffect(() => {
    if (!seen.current) {
      seen.current = new Map(orders.map((order) => [order.id, statusKey(order)]));
      return;
    }
    orders.forEach((order) => {
      const next = statusKey(order);
      const prev = seen.current.get(order.id);
      if (prev && prev !== next) {
        pushToast(`${order.orderNumber}: ${t(getCustomerOrderView(order).titleKey)}`);
      }
      seen.current.set(order.id, next);
    });
  }, [orders, pushToast, t]);

  const [tab, setTab] = useState("active");
  const allTerminal = orders.length > 0 && orders.every(isTerminalOrder);
  const visible = orders.filter((order) => (tab === "history" ? isTerminalOrder(order) : !isTerminalOrder(order)));

  useEffect(() => {
    if (!phone || !onOrders || allTerminal) return undefined;
    const timer = window.setInterval(() => {
      fetchCustomerOrders(phone)
        .then((rows) => onOrders(rows || []))
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [phone, onOrders, allTerminal]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        {["active", "history"].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-10 rounded-xl text-sm font-bold ${tab === id ? "bg-[#087B51] text-white" : "bg-white text-slate-700"}`}
          >
            {t(id === "active" ? "orders.active" : "orders.history")}
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="text-sm text-slate-500">{t("orders.tabEmpty")}</p>}
      {visible.map((order) => {
        const preview = itemPreview(order.items);
        const fee = Number(order.deliveryFee ?? DELIVERY_FEE);
        return (
    <Link
      key={order.id}
      to={`/orders/${order.id}`}
      className="block rounded-2xl border border-slate-100 bg-white p-4 text-inherit no-underline shadow-sm hover:border-brand/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-[#087B51]">{order.orderNumber}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(order.createdAt)}</p>
          {order.branch?.name && <p className="mt-1 truncate text-sm font-semibold text-slate-800">{order.branch.name}</p>}
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_TONES[order.status] || ""}`}>
          {t(getCustomerOrderView(order).titleKey)}
        </span>
      </div>
      {preview.shown && (
        <p className="mt-3 text-sm text-slate-700">
          {preview.shown}
          {preview.rest > 0 ? ` ${t("orders.moreItems", { count: preview.rest })}` : ""}
        </p>
      )}
      <p className="mt-3 text-base font-bold tabular-nums text-slate-900">{formatSom(order.totalAmount)}</p>
      {order.deliveryType === "PICKUP" ? (
        <p className="mt-1 text-xs text-slate-500">{t("orders.pickupNote")}</p>
      ) : fee > 0 ? (
        <p className="mt-1 text-xs text-slate-500">{t("orders.deliveryIncluded", { fee: formatSom(fee) })}</p>
      ) : null}
    </Link>
        );
      })}
    </div>
  );
}
