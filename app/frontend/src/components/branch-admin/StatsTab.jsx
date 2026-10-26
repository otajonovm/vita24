import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatSom, orderStatusLabel } from "../../lib/format";
import { fetchPanelStats, fetchShiftReport } from "../../services/api";
import { ErrorState, LoadingButton, RefetchBar, SkeletonTable } from "../ui";
import { apiError, printHtml } from "./panelShared";
import { createRequestGate, isCanceled } from "../../lib/requestGate";

export default function StatsTab({ branchId, onToast }) {
  const { t } = useTranslation();
  const [range, setRange] = useState("today");
  const [stats, setStats] = useState(null);
  const [shift, setShift] = useState(null);
  const [askShift, setAskShift] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);
  const requestGate = useRef(createRequestGate());

  function load(nextRange = range) {
    if (!branchId) return undefined;
    let active = true;
    const requestId = requestGate.current.next();
    setError("");
    setLoading(true);
    fetchPanelStats(branchId, nextRange)
      .then((data) => {
        if (!active || !requestGate.current.isLatest(requestId)) return;
        setStats(data);
      })
      .catch((err) => {
        if (!active || isCanceled(err) || !requestGate.current.isLatest(requestId)) return;
        setError(apiError(err, t("panel.loadFailed", "Ro'yxat yuklanmadi")));
        onToast(apiError(err, t("panel.loadFailed", "Ro'yxat yuklanmadi")));
      })
      .finally(() => {
        if (active && requestGate.current.isLatest(requestId)) setLoading(false);
      });
    return () => {
      active = false;
    };
  }

  useEffect(() => load(), [branchId, range]);

  async function endShift() {
    if (ending) return;
    const since = localStorage.getItem("vita24-shift-start") || new Date().toISOString();
    setEnding(true);
    try {
      const report = await fetchShiftReport(branchId, since);
      setShift(report);
      localStorage.setItem("vita24-shift-start", new Date().toISOString());
      setAskShift(false);
    } catch (err) {
      onToast(apiError(err, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setEnding(false);
    }
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {[
          ["today", t("panel.today", "Bugun")],
          ["7", t("panel.days7", "7 kun")],
          ["30", t("panel.days30", "30 kun")],
        ].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setRange(id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${range === id ? "bg-slate-900 text-white" : "bg-white"}`}>{label}</button>
        ))}
        <button type="button" onClick={() => setAskShift(true)} className="ml-auto h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white">{t("panel.shift", "Smenani yakunlash")}</button>
      </div>
      {loading && !stats && <SkeletonTable rows={3} />}
      {!loading && error && !stats && <ErrorState title={error} onRetry={() => load()} />}
      <div className="relative">
        <RefetchBar show={loading && Boolean(stats)} />
      {stats && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card title={t("panel.orders", "Buyurtmalar")} value={stats.orders} />
          <Card title={t("panel.todayRevenue", "Tushum")} value={formatSom(stats.revenue || 0)} />
          <Card title={t("panel.avgReview", "O'rtacha tekshiruv")} value={`${stats.averageReviewMinutes || 0} daq`} />
          <div className="rounded-2xl border border-slate-100 bg-white p-3 md:col-span-2">
            <p className="text-xs font-bold uppercase text-slate-500">{t("panel.byStatus", "Holatlar")}</p>
            <ul className="mt-2 grid gap-1 text-sm">
              {Object.entries(stats.byStatus || {}).map(([status, count]) => (
                <li key={status} className="flex justify-between"><span>{status === "REJECTED" ? "Rad etilgan" : orderStatusLabel({ status })}</span><span>{count}</span></li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-3">
            <p className="text-xs font-bold uppercase text-slate-500">{t("panel.rxShare", "Retseptlar")}</p>
            <p className="mt-2 text-sm">{t("panel.approve", "Tasdiqlash")}: {stats.approved}</p>
            <p className="text-sm">{t("panel.reject", "Rad etish")}: {stats.rejected}</p>
            <ul className="mt-2 grid gap-1 text-sm">
              {(stats.rejectReasons || []).map((item) => (
                <li key={item.reason}>{item.reason} · {item.count}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      </div>
      {askShift && (
        <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-4">
          <p className="text-sm">Smenani yakunlaysizmi? Hisobot ekranda chiqadi.</p>
          <div className="flex gap-2">
            <LoadingButton
              type="button"
              loading={ending}
              loadingText={t("common.saving")}
              onClick={endShift}
              className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Yakunlash
            </LoadingButton>
            <button type="button" disabled={ending} onClick={() => setAskShift(false)} className="h-10 rounded-xl px-3 text-sm disabled:opacity-50">Bekor</button>
          </div>
        </div>
      )}
      {shift && (
        <section className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-4 text-sm">
          <h2 className="text-lg font-extrabold">Smena hisoboti</h2>
          <p>{formatDateTime(shift.since)} — {formatDateTime(shift.until)}</p>
          <p>Online tushum: {formatSom(shift.onlineRevenue || 0)}</p>
          <p>Naqd tushum: {formatSom(shift.cashRevenue || 0)}</p>
          <p>Pul qaytarishlar: {shift.refunds || 0}</p>
          <p>Ombor harakatlari: {shift.stockMovements || 0}</p>
          {(shift.pharmacists || []).map((person) => (
            <p key={person.userName}>{person.userName}: tasdiq {person.approved}, rad {person.rejected}, yakun {person.completed}, ombor {person.stockChanges}</p>
          ))}
          <button
            type="button"
            onClick={() => printHtml(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A5;margin:10mm}body{font-family:sans-serif;font-size:12px}</style></head><body><h1>Smena hisoboti</h1><p>${formatDateTime(shift.since)} — ${formatDateTime(shift.until)}</p><p>Online: ${formatSom(shift.onlineRevenue || 0)}</p><p>Naqd: ${formatSom(shift.cashRevenue || 0)}</p><p>Pul qaytarish: ${shift.refunds || 0}</p><p>Ombor: ${shift.stockMovements || 0}</p></body></html>`)}
            className="h-10 w-fit rounded-xl border px-3 text-sm font-bold"
          >
            Chop etish
          </button>
        </section>
      )}
    </section>
  );
}

function Card({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3">
      <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}
