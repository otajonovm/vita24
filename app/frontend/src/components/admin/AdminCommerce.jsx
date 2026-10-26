import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import PrescriptionReviewModal from "../branch-admin/PrescriptionReviewModal";
import { formatDateTime, formatSom, orderStatusLabel, STATUS_TONES } from "../../lib/format";
import { can } from "../../lib/permissions";
import {
  fetchAdminBranches,
  fetchStaffOrder,
  fetchStaffOrders,
  markRefundDone,
  saveAdminNote,
  staffUpdateOrderStatus,
} from "../../services/api";
import { useAdminAuth } from "../../store/useAuthStore";
import { useToastStore } from "../../store/useToastStore";
import PrescriptionFile from "../prescriptions/PrescriptionFile";
import { LoadingButton } from "../ui";
import { AdminSkeleton, controlClass, DataTable, EmptyState, ErrorState, Field } from "./ui";

const SLOW_RX_MS = 30 * 60 * 1000;

function apiError(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

function waitMinutes(createdAt) {
  const age = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(age / 60000));
}

function Pager({ page, pages, onPage, t }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">
        {t("admin.prev")}
      </button>
      <span className="text-xs font-semibold text-slate-500">{t("admin.page", { page, pages })}</span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">
        {t("admin.next")}
      </button>
    </div>
  );
}

function useBranches() {
  const [branches, setBranches] = useState([]);
  useEffect(() => {
    fetchAdminBranches()
      .then((data) => setBranches(data || []))
      .catch(() => {});
  }, []);
  return branches;
}

function branchLabel(item, t) {
  const inactive = item.status && item.status !== "active";
  return inactive ? `${item.name} (${t("admin.inactive").toLowerCase()})` : item.name;
}

const selectClass = "h-11 rounded-xl border border-slate-200 px-3 text-sm";

export function OrdersPanel() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const branches = useBranches();
  const [branchId, setBranchId] = useState(params.get("branchId") || "");
  const [status, setStatus] = useState("");
  const [paymentProvider, setPaymentProvider] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [deliveryType, setDeliveryType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let active = true;
    const keep = rows.length > 0;
    if (!keep) setLoading(true);
    setError("");
    fetchStaffOrders({
      branchId: branchId || undefined,
      status: status || undefined,
      paymentProvider: paymentProvider || undefined,
      paymentStatus: paymentStatus || undefined,
      deliveryType: deliveryType || undefined,
      from: from && to ? from : undefined,
      to: from && to ? to : undefined,
      q: query || undefined,
      page,
      limit: 20,
      audience: "admin",
    })
      .then((data) => {
        if (!active) return;
        setRows(data.items);
        setTotal(data.total);
        setLimit(data.limit || 20);
      })
      .catch((err) => {
        if (active) setError(apiError(err, t("admin.errorTitle")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId, status, paymentProvider, paymentStatus, deliveryType, from, to, query, page, reloadKey, t]);

  const pages = Math.max(1, Math.ceil(total / limit));

  function resetPage(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h1 className="text-lg font-extrabold">{t("admin.nav.orders")}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <select aria-label={t("admin.colBranch")} value={branchId} onChange={resetPage(setBranchId)} className={selectClass}>
          <option value="">{t("admin.allBranches")}</option>
          {branches.map((item) => (
            <option key={item.id} value={item.id}>{branchLabel(item, t)}</option>
          ))}
        </select>
        <select aria-label={t("admin.colStatus")} value={status} onChange={resetPage(setStatus)} className={selectClass}>
          <option value="">{t("admin.allStatuses")}</option>
          {["PENDING_PRESCRIPTION", "PENDING_BRANCH", "WAITING_PAYMENT", "PAID", "PREPARING", "READY", "DELIVERING", "COMPLETED", "CANCELLED", "REJECTED"].map((code) => (
            <option key={code} value={code}>{t(`admin.status.${code}`)}</option>
          ))}
        </select>
        <select aria-label={t("admin.paymentType")} value={paymentProvider} onChange={resetPage(setPaymentProvider)} className={selectClass}>
          <option value="">{t("admin.allPayments")}</option>
          <option value="CASH">{t("admin.pay.CASH")}</option>
          <option value="CLICK">Click</option>
          <option value="PAYME">Payme</option>
        </select>
        <select aria-label={t("admin.paymentStatus")} value={paymentStatus} onChange={resetPage(setPaymentStatus)} className={selectClass}>
          <option value="">{t("admin.allPaymentStatuses")}</option>
          <option value="PENDING">{t("admin.payState.PENDING")}</option>
          <option value="COMPLETED">{t("admin.payState.COMPLETED")}</option>
          <option value="FAILED">{t("admin.payState.FAILED")}</option>
        </select>
        <select aria-label={t("admin.deliveryType")} value={deliveryType} onChange={resetPage(setDeliveryType)} className={selectClass}>
          <option value="">{t("admin.allDeliveries")}</option>
          <option value="DELIVERY">{t("admin.delivery.DELIVERY")}</option>
          <option value="PICKUP">{t("admin.delivery.PICKUP")}</option>
        </select>
        <input type="date" aria-label={t("admin.dash.from")} value={from} onChange={resetPage(setFrom)} className={selectClass} />
        <input type="date" aria-label={t("admin.dash.to")} value={to} onChange={resetPage(setTo)} className={selectClass} />
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder={t("admin.orderSearch")}
          aria-label={t("admin.orderSearch")}
          className="h-11 min-w-48 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none ring-brand/30 focus:ring-2"
        />
      </div>
      {error ? <div className="mt-3"><ErrorState title={error} onRetry={() => setReloadKey((value) => value + 1)} /></div> : null}
      {loading && rows.length === 0 ? (
        <div className="mt-4"><AdminSkeleton /></div>
      ) : !loading && rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={t("admin.emptyTitle")} body={t("admin.emptyBody")} />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">{t("admin.colOrder")}</th>
                <th className="py-2 pr-3">{t("admin.colCustomer")}</th>
                <th className="py-2 pr-3">{t("admin.colBranch")}</th>
                <th className="py-2 pr-3">{t("admin.colStatus")}</th>
                <th className="py-2 pr-3">{t("admin.paymentType")}</th>
                <th className="py-2 pr-3">{t("admin.deliveryType")}</th>
                <th className="py-2 pr-3">{t("admin.colTotal")}</th>
                <th className="py-2">{t("admin.colDate")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold">
                    <Link className="text-brand" to={`/admin/orders/${order.id}`}>{order.orderNumber}</Link>
                  </td>
                  <td className="py-2 pr-3">
                    <p>{order.customerName}</p>
                    <p className="text-xs text-slate-500">{order.customerPhone}</p>
                  </td>
                  <td className="py-2 pr-3">{order.branch?.name}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_TONES[order.status] || ""}`}>
                      {order.prescription?.status === "REJECTED" ? t("admin.status.REJECTED") : t(`admin.status.${order.status}`, orderStatusLabel(order))}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{order.payment ? t(`admin.pay.${order.payment.provider}`, order.payment.provider) : "—"}</td>
                  <td className="py-2 pr-3">{t(`admin.delivery.${order.deliveryType}`, order.deliveryType)}</td>
                  <td className="py-2 pr-3 tabular-nums">{formatSom(order.totalAmount)}</td>
                  <td className="py-2">{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} pages={pages} onPage={setPage} t={t} />
        </div>
      )}
    </section>
  );
}

export function AdminOrderPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const role = useAdminAuth((state) => state.user?.role);
  const canWrite = can(role, "orders.write");
  const push = useToastStore((state) => state.push);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const data = await fetchStaffOrder(id);
      setOrder(data);
      setAdminNote(data.adminNote || "");
    } catch (err) {
      setError(apiError(err, t("admin.errorTitle")));
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function cancelOrder(event) {
    event.preventDefault();
    const text = reason.trim();
    if (text.length < 3) {
      setReasonError(t("admin.reasonRequired"));
      return;
    }
    setReasonError("");
    setBusy(true);
    try {
      await staffUpdateOrderStatus(order.id, "CANCELLED", text, "admin");
      push(t("admin.statusSaved"), "success");
      setReason("");
      setCancelOpen(false);
      await load({ quiet: true });
    } catch (err) {
      push(apiError(err, t("admin.errorTitle")), "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const updated = await saveAdminNote(order.id, adminNote);
      setOrder(updated);
      setAdminNote(updated.adminNote || "");
      push(t("admin.noteSaved"), "success");
    } catch (err) {
      push(apiError(err, t("admin.errorTitle")), "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AdminSkeleton />;
  if (error || !order) return <ErrorState title={error || t("admin.errorTitle")} onRetry={load} />;

  const canCancel = !["COMPLETED", "CANCELLED"].includes(order.status);
  const paidOnline =
    order.payment?.status === "COMPLETED" &&
    String(order.payment?.provider || "").toUpperCase() !== "CASH";

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/admin/orders" className="text-xs font-bold text-brand">{t("admin.backToOrders")}</Link>
          <h1 className="text-lg font-extrabold">{order.orderNumber}</h1>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_TONES[order.status] || ""}`}>
          {order.prescription?.status === "REJECTED" ? t("admin.status.REJECTED") : t(`admin.status.${order.status}`)}
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 className="text-sm font-extrabold">{t("admin.customer")}</h2>
          <p className="mt-2 text-sm">{order.customerName}</p>
          <p className="text-sm text-slate-600">{order.customerPhone}</p>
          <p className="mt-2 text-sm text-slate-600">{order.deliveryAddress || t(`admin.delivery.${order.deliveryType}`)}</p>
          <h2 className="mt-4 text-sm font-extrabold">{t("admin.colBranch")}</h2>
          <p className="mt-1 text-sm">{order.branch?.name}</p>
          <p className="text-sm text-slate-600">{order.branch?.address}</p>
        </article>
        <article className="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 className="text-sm font-extrabold">{t("admin.amounts")}</h2>
          <dl className="mt-2 grid gap-1 text-sm">
            <div className="flex justify-between"><dt>{t("admin.medicines")}</dt><dd className="tabular-nums">{formatSom(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>{t("admin.deliveryFee")}</dt><dd className="tabular-nums">{formatSom(order.deliveryFee)}</dd></div>
            <div className="flex justify-between"><dt>{t("admin.discount")}{order.promoCode ? ` · ${order.promoCode}` : ""}</dt><dd className="tabular-nums">{formatSom(order.discount)}</dd></div>
            <div className="flex justify-between font-bold"><dt>{t("admin.colTotal")}</dt><dd className="tabular-nums">{formatSom(order.totalAmount)}</dd></div>
          </dl>
          <h2 className="mt-4 text-sm font-extrabold">{t("admin.paymentType")}</h2>
          <p className="mt-1 text-sm">
            {order.payment ? `${t(`admin.pay.${order.payment.provider}`, order.payment.provider)} · ${t(`admin.payState.${order.payment.status}`, order.payment.status)} · ${formatSom(order.payment.amount)}` : "—"}
          </p>
        </article>
      </div>
      <article className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 className="text-sm font-extrabold">{t("admin.medicines")}</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {(order.items || []).map((item) => (
            <li key={item.id || item.medicineId} className="flex justify-between gap-3">
              <span>{item.name} × {item.quantity}</span>
              <span className="tabular-nums">{formatSom(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
      </article>
      {order.prescription?.id ? (
        <article className="rounded-2xl border border-slate-100 bg-white p-4">
          <h2 className="mb-2 text-sm font-extrabold">{t("admin.viewRx")}</h2>
          <PrescriptionFile prescriptionId={order.prescription.id} audience="admin" fileName={order.prescription.fileName} />
        </article>
      ) : null}
      <article className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 className="text-sm font-extrabold">{t("admin.history")}</h2>
        <ul className="mt-2 grid gap-2">
          {(order.history || []).map((row) => (
            <li key={row.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <p className="font-semibold">
                {row.fromStatus ? t(`admin.status.${row.fromStatus}`, row.fromStatus) : "—"} → {t(`admin.status.${row.toStatus}`, row.toStatus)}
              </p>
              <p className="text-xs text-slate-500">
                {formatDateTime(row.createdAt)}
                {row.actorName ? ` · ${row.actorName}` : ""}
                {row.actorRole ? ` · ${t(`admin.role.${row.actorRole}`, row.actorRole)}` : ""}
              </p>
              {row.note ? <p className="mt-1 text-slate-700">{row.note}</p> : null}
            </li>
          ))}
        </ul>
      </article>
      <article className="rounded-2xl border border-slate-100 bg-white p-4">
        <Field label={t("admin.pharmacistNote")}>
          <textarea
            value={order.pharmacistNote || ""}
            readOnly
            className="min-h-20 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          />
        </Field>
        {order.notes ? <p className="mt-2 text-sm text-slate-600">{t("admin.customerNote")}: {order.notes}</p> : null}
      </article>
      {canWrite ? (
        <form onSubmit={saveNote} noValidate className="rounded-2xl border border-slate-100 bg-white p-4">
          <Field label={t("admin.adminNote")}>
            <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </Field>
          <LoadingButton type="submit" loading={busy} loadingText={t("common.saving")} className="mt-3 h-10 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">{t("admin.saveNote")}</LoadingButton>
        </form>
      ) : null}
      {canWrite && canCancel ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          {!cancelOpen ? (
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              className="h-10 rounded-xl bg-red-600 px-4 text-sm font-bold text-white"
            >
              {t("admin.cancelOrder")}
            </button>
          ) : (
            <form onSubmit={cancelOrder} noValidate className="grid gap-3">
              <h2 className="text-sm font-extrabold">{t("admin.cancelOrder")}</h2>
              {paidOnline ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                  {t("admin.cancelRefundWarn", { amount: formatSom(order.totalAmount) })}
                </p>
              ) : null}
              <Field label={t("admin.reason")} error={reasonError}>
                <input value={reason} onChange={(event) => setReason(event.target.value)} className={controlClass(Boolean(reasonError))} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <LoadingButton type="submit" loading={busy} loadingText={t("common.saving")} className="h-10 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50">
                  {t("admin.cancelOrder")}
                </LoadingButton>
                <button type="button" onClick={() => { setCancelOpen(false); setReasonError(""); }} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">
                  {t("admin.cancel")}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function PrescriptionQueue() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const waitLong = params.get("wait") === "long";
  const branches = useBranches();
  const [branchId, setBranchId] = useState(params.get("branchId") || "");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchStaffOrders({
      queue: waitLong ? undefined : "review",
      wait: waitLong ? "long" : undefined,
      branchId: branchId || undefined,
      sort: "wait",
      page,
      limit: 20,
      audience: "admin",
    })
      .then((data) => {
        if (!active) return;
        setRows(data.items);
        setTotal(data.total);
        setLimit(data.limit || 20);
      })
      .catch((err) => {
        if (active) setError(apiError(err, t("admin.errorTitle")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId, page, waitLong, t]);

  async function reload() {
    setError("");
    try {
      const data = await fetchStaffOrders({
        queue: waitLong ? undefined : "review",
        wait: waitLong ? "long" : undefined,
        branchId: branchId || undefined,
        sort: "wait",
        page,
        limit: 20,
        audience: "admin",
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(apiError(err, t("admin.errorTitle")));
    }
  }

  const pages = Math.max(1, Math.ceil(total / limit));
  const avgWait =
    rows.length === 0
      ? null
      : Math.round(rows.reduce((sum, order) => sum + waitMinutes(order.createdAt), 0) / rows.length);
  const byBranch = Object.entries(
    rows.reduce((acc, order) => {
      const name = order.branch?.name || "—";
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const longWaitCount = rows.filter((order) => Date.now() - new Date(order.createdAt).getTime() >= SLOW_RX_MS).length;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h1 className="text-lg font-extrabold">{t("admin.nav.prescriptions")}</h1>
      <p className="mt-1 text-sm text-slate-600">{waitLong ? t("admin.dash.slowRxHint", { minutes: 30 }) : t("admin.rxPlatformHint")}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">{t("admin.rxQueueCount")}</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums">{total}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">{t("admin.rxAvgWait")}</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums">
            {avgWait == null ? t("admin.dash.insufficientData") : t("admin.waitMinutes", { count: avgWait })}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 sm:col-span-2">
          <p className="text-[11px] font-semibold uppercase text-slate-500">{t("admin.rxByBranch")}</p>
          <p className="mt-1 text-sm text-slate-700">
            {byBranch.length === 0
              ? "—"
              : byBranch.map(([name, count]) => `${name}: ${count}`).join(" · ")}
          </p>
        </div>
      </div>
      {longWaitCount > 0 ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          {t("admin.rxLongWaitSignal", { count: longWaitCount })}
        </p>
      ) : null}
      <select aria-label={t("admin.colBranch")} value={branchId} onChange={(event) => { setBranchId(event.target.value); setPage(1); }} className={`mt-3 ${selectClass}`}>
        <option value="">{t("admin.allBranches")}</option>
        {branches.map((item) => (
          <option key={item.id} value={item.id}>{branchLabel(item, t)}</option>
        ))}
      </select>
      {error ? <div className="mt-3"><ErrorState title={error} onRetry={reload} /></div> : null}
      {loading ? (
        <div className="mt-4"><AdminSkeleton /></div>
      ) : rows.length === 0 ? (
        <div className="mt-4"><EmptyState title={t("admin.rxEmpty")} body={t("admin.rxEmptyBody")} /></div>
      ) : (
        <ul className="mt-4 grid gap-2">
          {rows.map((order) => {
            const slow = Date.now() - new Date(order.createdAt).getTime() >= SLOW_RX_MS;
            return (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => setSelected(order)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left ${slow ? "border-amber-300 bg-amber-50" : "border-slate-100"}`}
                >
                  <span>
                    <span className="block text-sm font-bold">{order.orderNumber}</span>
                    <span className="block text-xs text-slate-600">{order.customerName} · {order.branch?.name}</span>
                  </span>
                  <span className={`text-sm font-bold ${slow ? "text-amber-800" : "text-slate-700"}`}>
                    {t("admin.waitMinutes", { count: waitMinutes(order.createdAt) })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pages={pages} onPage={setPage} t={t} />
      {selected ? (
        <PrescriptionReviewModal
          order={selected}
          orders={rows}
          busy={false}
          audience="admin"
          readOnly
          onClose={() => setSelected(null)}
          onSelect={setSelected}
          onApprove={() => {}}
          onReject={() => {}}
        />
      ) : null}
    </section>
  );
}

export function RefundsPanel() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const push = useToastStore((state) => state.push);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [note, setNote] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const branchId = params.get("branchId") || "";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStaffOrders({
        refundStatus: "PENDING",
        branchId: branchId || undefined,
        page,
        limit: 20,
        audience: "admin",
      });
      setRows(data.items);
      setTotal(data.total);
      setLimit(data.limit || 20);
    } catch (err) {
      setError(apiError(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, branchId]);

  function open(order) {
    setActive(order);
    setNote("");
    setTransactionId("");
    setFields({});
  }

  async function submit(event) {
    event.preventDefault();
    const next = {};
    if (note.trim().length < 3) next.note = t("admin.reasonRequired");
    if (transactionId.trim().length < 3) next.transactionId = t("admin.transactionRequired");
    setFields(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await markRefundDone(active.id, { note: note.trim(), transactionId: transactionId.trim(), audience: "admin" });
      push(t("admin.refundDone"), "success");
      setActive(null);
      await load();
    } catch (err) {
      push(apiError(err, t("admin.errorTitle")), "error");
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / limit));
  if (loading) return <AdminSkeleton />;
  if (error) return <ErrorState title={error} onRetry={load} />;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h1 className="text-lg font-extrabold">{t("admin.nav.refunds")}</h1>
      <p className="mt-1 text-sm text-slate-600">{t("admin.refundsHint")}</p>
      <div className="mt-4">
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          searchText={(row) => [row.orderNumber, row.customerName, row.branch?.name, row.payment?.provider].join(" ")}
          emptyTitle={t("admin.refundsEmpty")}
          emptyBody={t("admin.refundsEmptyBody")}
          pageSize={20}
          columns={[
            { key: "orderNumber", header: t("admin.colOrder"), render: (row) => <Link className="font-semibold text-brand" to={`/admin/orders/${row.id}`}>{row.orderNumber}</Link> },
            { key: "amount", header: t("admin.colTotal"), sortValue: (row) => row.payment?.amount || row.totalAmount, render: (row) => formatSom(row.payment?.amount || row.totalAmount) },
            { key: "payment", header: t("admin.paymentType"), render: (row) => t(`admin.pay.${row.payment?.provider}`, row.payment?.provider || "—") },
            { key: "branch", header: t("admin.colBranch"), render: (row) => row.branch?.name || "—" },
            { key: "createdAt", header: t("admin.colDate"), sortValue: (row) => row.createdAt || "", render: (row) => formatDateTime(row.createdAt) },
            {
              key: "action",
              header: t("admin.colActions"),
              sortable: false,
              render: (row) => (
                <button type="button" onClick={() => open(row)} className="h-9 rounded-xl bg-brand px-3 text-xs font-bold text-white">
                  {t("admin.markRefunded")}
                </button>
              ),
            },
          ]}
        />
        <Pager page={page} pages={pages} onPage={setPage} t={t} />
      </div>
      {active ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 md:items-center" onClick={() => setActive(null)}>
          <form onSubmit={submit} noValidate onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-t-3xl bg-white p-5 md:rounded-3xl">
            <h2 className="text-base font-extrabold">{active.orderNumber}</h2>
            <div className="mt-3 grid gap-3">
              <Field label={t("admin.refundNote")} error={fields.note}>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} className={`min-h-20 ${controlClass(Boolean(fields.note))}`} />
              </Field>
              <Field label={t("admin.transactionId")} error={fields.transactionId}>
                <input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className={controlClass(Boolean(fields.transactionId))} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setActive(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">{t("admin.cancel")}</button>
              <LoadingButton type="submit" loading={busy} loadingText={t("common.saving")} className="h-10 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">{t("admin.markRefunded")}</LoadingButton>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

