import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatSom, orderStatusLabel } from "../../lib/format";
import { fetchPanelStats, fetchShiftReport } from "../../services/api";
import { apiError, printHtml } from "./panelShared";

export default function StatsTab({ branchId, onToast }) {
  const { t } = useTranslation();
  const [range, setRange] = useState("today");
  const [stats, setStats] = useState(null);
  const [shift, setShift] = useState(null);
  const [askShift, setAskShift] = useState(false);

  useEffect(() => {
    if (!branchId) return undefined;
    let active = true;
    fetchPanelStats(branchId, range)
      .then((data) => active && setStats(data))
      .catch((error) => onToast(apiError(error, t("panel.loadFailed", "Ro'yxat yuklanmadi"))));
    return () => {
      active = false;
    };
  }, [branchId, range]);

  async function endShift() {
    const since = localStorage.getItem("vita24-shift-start") || new Date().toISOString();
    try {
      const report = await fetchShiftReport(branchId, since);
      setShift(report);
      localStorage.setItem("vita24-shift-start", new Date().toISOString());
    } catch (error) {
      onToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
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
      {askShift && (
        <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-4">
          <p className="text-sm">Smenani yakunlaysizmi? Hisobot ekranda chiqadi.</p>
          <div className="flex gap-2">
            <button type="button" onClick={endShift} className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white">Yakunlash</button>
            <button type="button" onClick={() => setAskShift(false)} className="h-10 rounded-xl px-3 text-sm">Bekor</button>
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
