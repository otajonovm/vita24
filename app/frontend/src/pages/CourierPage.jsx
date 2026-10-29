import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  deliverCourierOrder,
  failCourierOrder,
  fetchCourierOrders,
  fetchCourierShift,
  pickupCourierOrder,
  staffLogin,
  submitCourierHandover,
} from "../services/api";
import { useCourierAuth } from "../store/useAuthStore";
import { formatSom } from "../lib/format";
import { LoadingButton } from "../components/ui";

const FAIL_REASONS = ["NO_ANSWER", "ADDRESS_NOT_FOUND", "CUSTOMER_REJECTED", "OTHER"];

function mapUrl(order, kind) {
  const point = Number.isFinite(Number(order.deliveryLat)) && Number.isFinite(Number(order.deliveryLng));
  const query = point ? `${order.deliveryLat},${order.deliveryLng}` : order.deliveryAddress || "";
  const encoded = encodeURIComponent(query);
  if (kind === "yandex") return `https://yandex.uz/maps/?text=${encoded}`;
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function failLabel(value, t) {
  const raw = String(value || "");
  const code = raw.split(":")[0].trim();
  const note = raw.slice(code.length).replace(/^:\s*/, "");
  const known = FAIL_REASONS.includes(code);
  const label = known ? t(`courier.fail.${code}`) : raw;
  return note ? `${label}: ${note}` : label;
}

function dueText(order, t) {
  if (order.prepaid || order.paymentMethod === "CLICK" || order.paymentMethod === "PAYME" || order.paymentMethod === "MOCK") {
    return t("courier.pay.prepaid");
  }
  if (order.paymentMethod === "CARD_TERMINAL") return t("courier.pay.terminal");
  return t("courier.pay.cash", { amount: formatSom(order.amountDue) });
}

function errorText(error, fallback) {
  return error?.response?.data?.error?.message || error?.message || fallback;
}

export default function CourierPage() {
  const { t } = useTranslation();
  const token = useCourierAuth((state) => state.token);
  const user = useCourierAuth((state) => state.user);
  if (!token || user?.role !== "COURIER") return <CourierLogin />;
  return <CourierBoard />;
}

function CourierLogin() {
  const { t } = useTranslation();
  const setSession = useCourierAuth((state) => state.setSession);
  const [phone, setPhone] = useState("+998");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await staffLogin({ phone, password });
      if (result?.user?.role !== "COURIER" || !result.token) {
        setError(t("courier.login.staffOnly"));
        return;
      }
      setSession(result.user, result.token);
    } catch (err) {
      setError(errorText(err, t("courier.login.failed")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-md gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Vita24</p>
        <h1 className="mt-1 text-2xl font-extrabold">{t("courier.login.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("courier.login.hint")}</p>
      </div>
      <label className="grid gap-1 text-sm font-semibold">
        {t("courier.panel.phone")}
        <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" className="h-14 rounded-xl border border-slate-200 px-3 text-lg" />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {t("courier.panel.password")}
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-14 rounded-xl border border-slate-200 px-3 text-lg" />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <LoadingButton type="submit" loading={loading} className="h-14 rounded-xl bg-brand text-lg font-bold text-white disabled:opacity-50">
        {t("courier.login.submit")}
      </LoadingButton>
    </form>
  );
}

function CourierBoard() {
  const { t } = useTranslation();
  const logout = useCourierAuth((state) => state.logout);
  const token = useCourierAuth((state) => state.token);
  const [scope, setScope] = useState("active");
  const [orders, setOrders] = useState([]);
  const [shift, setShift] = useState(null);
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(0);

  function reload() {
    setPulse((value) => value + 1);
  }

  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([fetchCourierOrders(scope), fetchCourierShift()])
      .then(([list, summary]) => {
        if (!active) return;
        setOrders(list);
        setShift(summary);
      })
      .catch((err) => {
        if (active) setError(errorText(err, t("courier.loadFailed")));
      });
    return () => {
      active = false;
    };
  }, [scope, pulse, t]);

  useEffect(() => {
    if (!token) return undefined;
    let stopped = false;
    const controller = new AbortController();
    async function stream() {
      try {
        const apiBase = String(import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
        const response = await fetch(`${apiBase}/courier/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          if (parts.some((part) => /event:\s*order/.test(part))) reload();
        }
      } catch {
        if (!stopped) setTimeout(stream, 2000);
      }
    }
    stream();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [token]);

  return (
    <div className="mx-auto grid w-full max-w-lg gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand">Vita24</p>
          <h1 className="text-2xl font-extrabold">{t("courier.login.title")}</h1>
        </div>
        <button type="button" onClick={logout} className="h-12 rounded-xl px-3 text-sm font-semibold text-slate-500">
          {t("courier.logout")}
        </button>
      </div>
      <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
        <p className="text-xs font-semibold uppercase text-slate-300">{t("courier.shift.cash")}</p>
        <p className="text-3xl font-extrabold tabular-nums">{formatSom(shift?.cashOnHand || 0)}</p>
        <p className="mt-1 text-sm text-slate-300">
          {t("courier.shift.delivered")}: {shift?.deliveredToday ?? 0}
          {" · "}
          {t("courier.shift.card")}: {formatSom(shift?.cardCollected || 0)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {["active", "history"].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setScope(id)}
            className={`h-14 rounded-xl text-lg font-bold ${scope === id ? "bg-brand text-white" : "bg-white text-slate-800"}`}
          >
            {t(id === "active" ? "courier.tab.active" : "courier.tab.history")}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {scope === "active" && Number(shift?.unhanded) > 0 && (
        <HandoverBar shift={shift} onDone={reload} />
      )}
      {!orders.length && !error && <p className="rounded-2xl bg-white p-6 text-center text-slate-500">{t("courier.empty")}</p>}
      {orders.map((order) => (
        <OrderTicket key={order.id} order={order} history={scope === "history"} onDone={reload} />
      ))}
    </div>
  );
}

function HandoverBar({ shift, onDone }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(shift.unhanded || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await submitCourierHandover({ amount: Number(amount), orderIds: shift.unhandedOrderIds || [] });
      onDone();
    } catch (err) {
      setError(errorText(err, t("courier.loadFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-2xl bg-white p-4">
      <p className="text-sm font-bold">{t("courier.shift.unhanded")}: {formatSom(shift.unhanded)}</p>
      <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="h-14 rounded-xl border border-slate-200 px-3 text-lg" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <LoadingButton type="button" loading={busy} onClick={submit} className="h-14 rounded-xl bg-slate-900 text-lg font-bold text-white disabled:opacity-50">
        {t("courier.shift.handover")}
      </LoadingButton>
    </div>
  );
}

function OrderTicket({ order, history, onDone }) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      setSheet("");
      onDone();
    } catch (err) {
      setError(errorText(err, t("courier.loadFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-extrabold">{order.orderNumber}</h2>
        <p className="text-right text-sm font-bold uppercase">{dueText(order, t)}</p>
      </div>
      <p className="text-lg font-semibold">{order.customerName}</p>
      <p className="text-base text-slate-700">{order.deliveryAddress}</p>
      <div className="grid grid-cols-2 gap-2">
        <a className="grid h-12 place-items-center rounded-xl bg-slate-100 text-sm font-bold" href={mapUrl(order, "yandex")} target="_blank" rel="noreferrer">{t("courier.card.yandex")}</a>
        <a className="grid h-12 place-items-center rounded-xl bg-slate-100 text-sm font-bold" href={mapUrl(order, "google")} target="_blank" rel="noreferrer">{t("courier.card.google")}</a>
      </div>
      <a className="grid h-14 place-items-center rounded-xl bg-brand text-lg font-bold text-white" href={`tel:${order.customerPhone}`}>
        {t("courier.card.call")}
      </a>
      <ul className="grid gap-1 text-base">
        {(order.items || []).map((item, index) => (
          <li key={`${item.name}-${index}`}>{item.name} × {item.quantity}</li>
        ))}
      </ul>
      {order.deliveryFailReason && <p className="text-sm text-red-700">{failLabel(order.deliveryFailReason, t)}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!history && order.courierStage === "ASSIGNED" && (
        <LoadingButton type="button" loading={busy} onClick={() => run(() => pickupCourierOrder(order.id))} className="h-14 rounded-xl bg-brand text-lg font-bold text-white disabled:opacity-50">
          {t("courier.card.pickup")}
        </LoadingButton>
      )}
      {!history && order.courierStage === "PICKED_UP" && (
        <div className="grid gap-2">
          <button type="button" onClick={() => setSheet("deliver")} className="h-14 rounded-xl bg-brand text-lg font-bold text-white">{t("courier.card.deliver")}</button>
          <button type="button" onClick={() => setSheet("fail")} className="h-14 rounded-xl border border-red-200 text-lg font-bold text-red-700">{t("courier.card.fail")}</button>
        </div>
      )}
      {sheet === "deliver" && <DeliverSheet order={order} busy={busy} onClose={() => setSheet("")} onSubmit={(payload) => run(() => deliverCourierOrder(order.id, payload))} />}
      {sheet === "fail" && <FailSheet busy={busy} onClose={() => setSheet("")} onSubmit={(payload) => run(() => failCourierOrder(order.id, payload))} />}
    </article>
  );
}

function DeliverSheet({ order, busy, onClose, onSubmit }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(String(order.amountDue || ""));
  const [receiptGiven, setReceiptGiven] = useState(false);
  const [photo, setPhoto] = useState(null);
  const prepaid = Boolean(order.prepaid);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-900/40" onClick={onClose}>
      <form
        className="grid w-full gap-3 rounded-t-3xl bg-white p-4"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            method: prepaid ? "PREPAID" : order.paymentMethod,
            collectedAmount: prepaid ? undefined : amount,
            receiptGiven,
            photo,
          });
        }}
      >
        <h3 className="text-xl font-extrabold">{t("courier.deliver.title")}</h3>
        {prepaid ? (
          <p className="text-base">{t("courier.deliver.prepaidHint")}</p>
        ) : (
          <label className="grid gap-1 text-sm font-semibold">
            {t("courier.deliver.amount")}
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="h-14 rounded-xl border border-slate-200 px-3 text-lg" required />
          </label>
        )}
        <label className="flex items-center gap-2 text-base font-semibold">
          <input type="checkbox" checked={receiptGiven} onChange={(event) => setReceiptGiven(event.target.checked)} />
          {t("courier.deliver.receipt")}
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t("courier.deliver.photo")}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
        </label>
        <LoadingButton type="submit" loading={busy} className="h-14 rounded-xl bg-brand text-lg font-bold text-white disabled:opacity-50">
          {t("courier.deliver.confirm")}
        </LoadingButton>
      </form>
    </div>
  );
}

function FailSheet({ busy, onClose, onSubmit }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-900/40" onClick={onClose}>
      <form
        className="grid w-full gap-3 rounded-t-3xl bg-white p-4"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!reason) return;
          onSubmit({ reason, note });
        }}
      >
        <h3 className="text-xl font-extrabold">{t("courier.fail.title")}</h3>
        <div className="grid gap-2">
          {FAIL_REASONS.map((id) => (
            <button key={id} type="button" onClick={() => setReason(id)} className={`h-12 rounded-xl text-left px-3 text-base font-bold ${reason === id ? "bg-slate-900 text-white" : "bg-slate-100"}`}>
              {t(`courier.fail.${id}`)}
            </button>
          ))}
        </div>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("courier.fail.note")} className="h-14 rounded-xl border border-slate-200 px-3 text-lg" />
        <LoadingButton type="submit" loading={busy} disabled={!reason} className="h-14 rounded-xl bg-red-600 text-lg font-bold text-white disabled:opacity-50">
          {t("courier.fail.submit")}
        </LoadingButton>
      </form>
    </div>
  );
}
