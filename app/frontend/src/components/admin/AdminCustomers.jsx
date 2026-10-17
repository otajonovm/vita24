import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { formatDateTime, formatSom } from "../../lib/format";
import { fetchAdminCustomer, fetchAdminCustomers, setCustomerBlock } from "../../services/api";
import { useToastStore } from "../../store/useToastStore";
import { AdminSkeleton, DataTable, ErrorState, controlClass } from "./ui";

function errorText(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

function statusClass(status) {
  return status === "SUSPENDED"
    ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800"
    : "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700";
}

export function CustomerManager() {
  const { t } = useTranslation();
  const pushToast = useToastStore((state) => state.push);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orderFilter, setOrderFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [card, setCard] = useState(null);
  const [cardError, setCardError] = useState("");
  const [cardLoading, setCardLoading] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAdminCustomers());
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openCard(id) {
    setSelectedId(id);
    setCard(null);
    setCardError("");
    setCardLoading(true);
    setReasonOpen(false);
    try {
      setCard(await fetchAdminCustomer(id));
    } catch (err) {
      setCardError(errorText(err, t("admin.errorTitle")));
    } finally {
      setCardLoading(false);
    }
  }

  function closeCard() {
    setSelectedId(null);
    setCard(null);
    setReasonOpen(false);
    setReason("");
    setReasonError("");
  }

  async function submitReason(event) {
    event.preventDefault();
    const text = reason.trim();
    if (text.length < 3) {
      setReasonError(t("admin.reasonRequired"));
      return;
    }
    const blocking = card?.status !== "SUSPENDED";
    setSaving(true);
    try {
      await setCustomerBlock(selectedId, { action: blocking ? "BLOCK" : "UNBLOCK", reason: text });
      pushToast(blocking ? t("admin.customerBlocked") : t("admin.customerUnblocked"));
      setReason("");
      setReasonOpen(false);
      await Promise.all([load(), openCard(selectedId)]);
    } catch (err) {
      pushToast(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setSaving(false);
    }
  }

  const visible = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (orderFilter === "with" && !(row.orderCount > 0)) return false;
    if (orderFilter === "without" && row.orderCount > 0) return false;
    return true;
  });

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">{t("admin.nav.customers")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("admin.customersHint")}</p>
      </div>
      {loading ? (
        <AdminSkeleton />
      ) : error ? (
        <ErrorState title={error} onRetry={load} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t("admin.colStatus")}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
            >
              <option value="all">{t("admin.allCustomers")}</option>
              <option value="ACTIVE">{t("admin.customerStatus.ACTIVE")}</option>
              <option value="SUSPENDED">{t("admin.customerStatus.SUSPENDED")}</option>
            </select>
            <select
              aria-label={t("admin.colOrders")}
              value={orderFilter}
              onChange={(event) => setOrderFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
            >
              <option value="all">{t("admin.allOrdersFilter")}</option>
              <option value="with">{t("admin.withOrders")}</option>
              <option value="without">{t("admin.withoutOrders")}</option>
            </select>
          </div>
          <DataTable
            rows={visible}
            rowKey={(row) => row.id}
            searchText={(row) => `${row.name} ${row.phone}`}
            emptyTitle={t("admin.customersEmpty")}
            emptyBody={
              statusFilter === "all" && orderFilter === "all"
                ? t("admin.customersEmptyBody")
                : t("admin.emptyBody")
            }
            columns={[
              { key: "name", header: t("admin.colName"), sortValue: (row) => row.name },
              { key: "phone", header: t("admin.colPhone"), sortValue: (row) => row.phone },
              {
                key: "createdAt",
                header: t("admin.colRegistered"),
                sortValue: (row) => row.createdAt || "",
                render: (row) => formatDateTime(row.createdAt),
              },
              { key: "orderCount", header: t("admin.colOrders"), sortValue: (row) => row.orderCount },
              {
                key: "totalSpent",
                header: t("admin.colSpent"),
                sortValue: (row) => row.totalSpent,
                render: (row) => formatSom(row.totalSpent),
              },
              {
                key: "lastOrder",
                header: t("admin.colLastOrder"),
                sortValue: (row) => row.lastOrder?.createdAt || "",
                render: (row) =>
                  row.lastOrder
                    ? `${row.lastOrder.orderNumber} · ${formatDateTime(row.lastOrder.createdAt)}`
                    : "—",
              },
              {
                key: "status",
                header: t("admin.colStatus"),
                sortValue: (row) => row.status,
                render: (row) => <span className={statusClass(row.status)}>{t(`admin.customerStatus.${row.status}`)}</span>,
              },
              {
                key: "actions",
                header: t("admin.colActions"),
                sortable: false,
                render: (row) => (
                  <button
                    type="button"
                    onClick={() => openCard(row.id)}
                    className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"
                  >
                    {t("admin.openCard")}
                  </button>
                ),
              },
            ]}
          />
        </>
      )}

      {selectedId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={closeCard}>
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">{card?.name || t("admin.nav.customers")}</h2>
                {card && <p className="mt-1 text-sm text-slate-500">{card.phone}</p>}
              </div>
              <button type="button" onClick={closeCard} aria-label={t("common.close")} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            {cardLoading ? (
              <div className="mt-4"><AdminSkeleton rows={3} /></div>
            ) : cardError ? (
              <div className="mt-4"><ErrorState title={cardError} onRetry={() => openCard(selectedId)} /></div>
            ) : card ? (
              <div className="mt-4 grid gap-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={statusClass(card.status)}>{t(`admin.customerStatus.${card.status}`)}</span>
                  <span className="text-slate-500">{t("admin.colRegistered")}: {formatDateTime(card.createdAt)}</span>
                </div>
                {card.status === "SUSPENDED" && card.blockReason && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{card.blockReason}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReasonOpen(true);
                      setReason("");
                      setReasonError("");
                    }}
                    className={`h-10 rounded-xl px-3 text-sm font-bold text-white ${card.status === "SUSPENDED" ? "bg-brand" : "bg-red-600"}`}
                  >
                    {card.status === "SUSPENDED" ? t("admin.unblock") : t("admin.block")}
                  </button>
                </div>
                {reasonOpen && (
                  <form noValidate onSubmit={submitReason} className="grid gap-2 rounded-xl border border-slate-200 p-3">
                    <p className="text-sm text-slate-600">
                      {card.status === "SUSPENDED" ? t("admin.unblockHint") : t("admin.blockHint")}
                    </p>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold text-slate-600">{t("admin.reason")}</span>
                      <textarea
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value);
                          setReasonError("");
                        }}
                        rows={3}
                        className={`${controlClass(reasonError)} h-auto py-2`}
                        aria-invalid={Boolean(reasonError)}
                      />
                      {reasonError && <span className="text-xs font-medium text-red-600">{reasonError}</span>}
                    </label>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setReasonOpen(false)} className="h-10 rounded-xl px-3 text-sm font-bold text-slate-600">
                        {t("admin.cancel")}
                      </button>
                      <button type="submit" disabled={saving} className="h-10 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-60">
                        {saving ? t("admin.saving") : t("admin.confirm")}
                      </button>
                    </div>
                  </form>
                )}

                <section className="grid gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900">{t("admin.orderHistory")}</h3>
                  {card.orders.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("admin.noCustomerOrders")}</p>
                  ) : (
                    <ul className="grid gap-2">
                      {card.orders.map((order) => (
                        <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                          <Link to={`/admin/orders/${order.id}`} className="font-bold text-brand">{order.orderNumber}</Link>
                          <span>{order.branchName || "—"}</span>
                          <span>{t(`admin.status.${order.status}`, order.status)}</span>
                          <span>{formatSom(order.totalAmount)}</span>
                          <span className="text-slate-500">{formatDateTime(order.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="grid gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900">{t("admin.addresses")}</h3>
                  {card.addresses.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("admin.noAddresses")}</p>
                  ) : (
                    <ul className="grid gap-2">
                      {card.addresses.map((item) => (
                        <li key={`${item.source}-${item.line}`} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                          <span className="font-semibold text-slate-700">{t(`admin.addressSource.${item.source}`)}</span>
                          <p className="text-slate-600">{item.line}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="grid gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900">{t("admin.nav.prescriptions")}</h3>
                  {card.prescriptions.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("admin.noPrescriptions")}</p>
                  ) : (
                    <ul className="grid gap-2">
                      {card.prescriptions.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                          <span className="font-semibold">{item.fileName}</span>
                          <span>{item.orderNumber || "—"}</span>
                          <span>{t(`admin.rxStatus.${item.status}`, item.status)}</span>
                          <span className="text-slate-500">{formatDateTime(item.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="grid gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900">{t("admin.promoUse")}</h3>
                  {card.promos.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("admin.noPromos")}</p>
                  ) : (
                    <ul className="grid gap-2">
                      {card.promos.map((item) => (
                        <li key={item.orderId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                          <span className="font-bold">{item.code}</span>
                          <span>{item.orderNumber}</span>
                          <span>{formatSom(item.discount)}</span>
                          <span className="text-slate-500">{formatDateTime(item.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="grid gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900">{t("admin.blockHistory")}</h3>
                  {card.blockEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("admin.noBlockHistory")}</p>
                  ) : (
                    <ul className="grid gap-2">
                      {card.blockEvents.map((event) => (
                        <li key={event.id} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                          <p className="font-semibold">{t(`admin.blockAction.${event.action}`)} · {event.actorName || "—"}</p>
                          <p className="text-slate-600">{event.reason}</p>
                          <p className="text-slate-500">{formatDateTime(event.createdAt)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
