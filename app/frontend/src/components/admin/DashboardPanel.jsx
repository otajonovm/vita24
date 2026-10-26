import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatSom } from "../../lib/format";
import { downloadAdminReport, fetchAdminDashboard } from "../../services/api";
import { useToastStore } from "../../store/useToastStore";
import { AdminSkeleton, DataTable, EmptyState, ErrorState } from "./ui";

const COLORS = ["#087B51", "#0f766e", "#d97706", "#0369a1", "#7c3aed", "#be123c", "#64748b", "#65a30d", "#c2410c"];

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function presetRange(id) {
  const to = todayKey();
  if (id === "today") return { from: to, to };
  if (id === "30") return { from: addDays(to, -29), to };
  if (id === "month") return { from: `${to.slice(0, 8)}01`, to };
  return { from: addDays(to, -6), to };
}

function percent(share) {
  return `${Math.round(Number(share || 0) * 1000) / 10}%`;
}

function apiError(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

export default function DashboardPanel() {
  const { t } = useTranslation();
  const push = useToastStore((state) => state.push);
  const initial = presetRange("7");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState("");

  const rangeError = from && to && from > to ? t("admin.dash.rangeError") : "";

  async function load() {
    if (from > to) return;
    setLoading(true);
    setError("");
    try {
      setData(await fetchAdminDashboard({ from, to, branchId: branchId || undefined }));
    } catch (err) {
      setError(apiError(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [from, to, branchId]);

  const activePreset = useMemo(() => {
    return ["today", "7", "30", "month"].find((id) => {
      const range = presetRange(id);
      return range.from === from && range.to === to;
    }) || "";
  }, [from, to]);

  function applyPreset(id) {
    const range = presetRange(id);
    setFrom(range.from);
    setTo(range.to);
  }

  async function exportFile(kind, format) {
    setExporting(`${kind}-${format}`);
    try {
      await downloadAdminReport({ kind, format, from, to, branchId: branchId || undefined });
    } catch (err) {
      push(apiError(err, t("admin.dash.exportFailed")), "error");
    } finally {
      setExporting("");
    }
  }

  const summary = data?.summary;
  const query = branchId ? `branchId=${encodeURIComponent(branchId)}` : "";
  const withQuery = (path, extra) => {
    const params = new URLSearchParams(query);
    Object.entries(extra || {}).forEach(([key, value]) => params.set(key, value));
    const text = params.toString();
    return text ? `${path}?${text}` : path;
  };

  const alerts = [
    { key: "lowStock", to: withQuery("/admin/stock", { low: "1" }), label: t("admin.dash.lowStock"), hint: t("admin.dash.lowStockHint", { count: data?.alerts?.lowStockThreshold || 5 }) },
    { key: "pendingRefunds", to: withQuery("/admin/refunds", { status: "PENDING" }), label: t("admin.dash.pendingRefunds"), hint: t("admin.dash.pendingRefundsHint") },
    { key: "slowPrescriptions", to: withQuery("/admin/prescriptions", { wait: "long" }), label: t("admin.dash.slowRx"), hint: t("admin.dash.slowRxHint", { minutes: data?.alerts?.slowPrescriptionMinutes || 30 }) },
    { key: "lekkoErrors", to: withQuery("/admin/lekko", { error: "1" }), label: t("admin.dash.lekkoErrors"), hint: t("admin.dash.lekkoErrorsHint") },
    { key: "closedBranches", to: withQuery("/admin/branches", { closed: "1" }), label: t("admin.dash.closedBranches"), hint: t("admin.dash.closedBranchesHint") },
  ];

  const cards = summary
    ? [
        { label: t("admin.dash.revenueOnline"), value: formatSom(summary.revenueOnline) },
        { label: t("admin.dash.revenueCash"), value: formatSom(summary.revenueCash) },
        { label: t("admin.dash.orders"), value: summary.orderCount },
        { label: t("admin.dash.average"), value: formatSom(summary.averageCheck) },
        { label: t("admin.dash.cancelled"), value: `${summary.cancelledCount} · ${percent(summary.cancelledShare)}` },
        { label: t("admin.dash.rejected"), value: `${summary.rejectedCount} · ${percent(summary.rejectedShare)}` },
        { label: t("admin.dash.refunds"), value: `${summary.refunds.count} · ${formatSom(summary.refunds.amount)}` },
        { label: t("admin.dash.newCustomers"), value: summary.newCustomers },
        { label: t("admin.dash.reviewTime"), value: summary.avgReviewMinutes == null ? t("admin.dash.insufficientData") : t("admin.dash.minutes", { count: summary.avgReviewMinutes }) },
        { label: t("admin.dash.deliveryTime"), value: summary.avgDeliveryMinutes == null ? t("admin.dash.insufficientData") : t("admin.dash.minutes", { count: summary.avgDeliveryMinutes }) },
      ]
    : [];

  const statusChart = (data?.statuses || []).map((row) => ({
    ...row,
    name: t(`admin.status.${row.status}`, { defaultValue: row.status }),
  }));

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{t("admin.dashboardTitle")}</h1>
          <p className="text-sm text-slate-500">{t("admin.dash.hint")}</p>
        </div>
        <select aria-label={t("admin.colBranch")} value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">{t("admin.allBranches")}</option>
          {(data?.branches || []).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          ["today", t("admin.dash.today")],
          ["7", t("admin.dash.days7")],
          ["30", t("admin.dash.days30")],
          ["month", t("admin.dash.thisMonth")],
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => applyPreset(id)} className={`h-10 rounded-xl px-3 text-sm font-bold ${activePreset === id ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
            {label}
          </button>
        ))}
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          {t("admin.dash.from")}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-sm text-slate-800" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-500">
          {t("admin.dash.to")}
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-2 text-sm text-slate-800" />
        </label>
      </div>
      {rangeError && <p className="text-sm font-medium text-red-600">{rangeError}</p>}

      {loading ? <AdminSkeleton rows={4} /> : error ? <ErrorState title={error} onRetry={load} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {cards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <p className="mt-2 text-lg font-extrabold text-slate-900">{card.value}</p>
              </div>
            ))}
          </div>

          {data.alerts.prescriptionMedicines === 0 && (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
              <p className="text-sm font-extrabold text-red-950">{t("admin.dash.rxMissing")}</p>
              <Link to="/admin/catalog?rx=1" className="mt-2 inline-flex text-sm font-bold text-red-900">{t("admin.dash.rxMissingLink")}</Link>
            </div>
          )}

          {(data.alerts.lekkoItems || []).length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-extrabold text-amber-950">{t("admin.dash.lekkoErrors")}</p>
              <ul className="mt-2 grid gap-2">
                {data.alerts.lekkoItems.map((item) => (
                  <li key={item.id}>
                    <Link to={`/admin/lekko?error=1`} className="text-sm font-bold text-amber-950">{item.name}</Link>
                    <p className="text-xs text-amber-900">{item.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {alerts.map((alert) => (
              <Link key={alert.key} to={alert.to} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-2xl font-extrabold text-slate-900">{data.alerts[alert.key]}</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{alert.label}</p>
                <p className="mt-1 text-xs text-slate-500">{alert.hint}</p>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900">{t("admin.dash.byDay")}</h2>
              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.days}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="money" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="count" orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar yAxisId="money" dataKey="revenue" name={t("admin.dash.revenue")} fill="#087B51" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="count" dataKey="orders" name={t("admin.dash.orders")} stroke="#0f172a" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900">{t("admin.dash.topMedicines")}</h2>
              {data.topMedicines.length === 0 ? (
                <div className="mt-3"><EmptyState title={t("admin.emptyTitle")} body={t("admin.dash.noSales")} /></div>
              ) : (
                <div className="mt-3 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.topMedicines} layout="vertical" margin={{ left: 16 }}>
                      <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="quantity" name={t("admin.colQty")} fill="#0f766e" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>
          </div>

          <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900">{t("admin.dash.branchCompare")}</h2>
            <div className="mt-3">
              <DataTable
                rows={data.branches}
                rowKey={(row) => row.id}
                searchText={(row) => row.name}
                emptyTitle={t("admin.branchesEmpty")}
                columns={[
                  { key: "name", header: t("admin.colBranch"), render: (row) => <span className="font-semibold text-slate-900">{row.name}</span> },
                  { key: "orders", header: t("admin.dash.orders"), sortValue: (row) => row.orders },
                  { key: "revenue", header: t("admin.dash.revenue"), sortValue: (row) => row.revenue, render: (row) => formatSom(row.revenue) },
                  { key: "revenueOnline", header: t("admin.dash.revenueOnline"), sortValue: (row) => row.revenueOnline, render: (row) => formatSom(row.revenueOnline) },
                  { key: "revenueCash", header: t("admin.dash.revenueCash"), sortValue: (row) => row.revenueCash, render: (row) => formatSom(row.revenueCash) },
                  { key: "averageCheck", header: t("admin.dash.average"), sortValue: (row) => row.averageCheck, render: (row) => formatSom(row.averageCheck) },
                  { key: "cancelled", header: t("admin.dash.cancelled"), sortValue: (row) => row.cancelled },
                  { key: "rejected", header: t("admin.dash.rejected"), sortValue: (row) => row.rejected },
                ]}
              />
            </div>
          </article>

          <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900">{t("admin.dash.byStatus")}</h2>
            {statusChart.length === 0 ? (
              <div className="mt-3"><EmptyState title={t("admin.emptyTitle")} body={t("admin.dash.noOrders")} /></div>
            ) : (
              <div className="mt-3 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusChart} dataKey="count" nameKey="name" innerRadius={56} outerRadius={90}>
                      {statusChart.map((row, index) => (
                        <Cell key={row.status} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900">{t("admin.dash.export")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ["orders", t("admin.nav.orders")],
                ["revenue", t("admin.dash.revenue")],
                ["branches", t("admin.nav.branches")],
                ["medicines", t("admin.dash.medicines")],
              ].map(([kind, label]) => (
                <div key={kind} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2">
                  <p className="text-sm font-bold text-slate-800">{label}</p>
                  <div className="flex gap-2">
                    {["csv", "xlsx"].map((format) => (
                      <button
                        key={format}
                        type="button"
                        disabled={Boolean(exporting) || Boolean(rangeError)}
                        onClick={() => exportFile(kind, format)}
                        className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold uppercase text-slate-700 disabled:opacity-40"
                      >
                        {exporting === `${kind}-${format}` ? "..." : format}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </>
      )}
    </section>
  );
}
