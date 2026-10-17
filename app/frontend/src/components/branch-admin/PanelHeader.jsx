import { useTranslation } from "react-i18next";
import { formatSom } from "../../lib/format";

export default function PanelHeader({
  summary,
  tab,
  onTab,
  sound,
  onSound,
  onRefresh,
  refreshing,
  onLogout,
  branch,
  branches,
  onBranch,
  onToggleOpen,
  openBusy,
  link,
  onOpenQueue,
  onOpenToday,
  onOpenLowStock,
  readOnly = false,
}) {
  const { t } = useTranslation();
  const tabs = [
    ["orders", t("panel.orders", "Buyurtmalar")],
    ["stock", t("panel.stock", "Ombor")],
    ["stats", t("panel.stats", "Statistika")],
  ];

  return (
    <header className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("panel.title", "Vita24 Farmatsevt")}</p>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${link === "live" ? "bg-emerald-500" : "bg-amber-400"}`} title={link === "live" ? "Jonli" : "Qayta ulanmoqda"} />
            {branch?.name || t("panel.branch", "Filial")}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {branches?.length > 1 && (
            <select value={branch?.id || ""} onChange={(event) => onBranch(event.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm">
              {branches.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          )}
          {!readOnly && (
            <button
              type="button"
              disabled={openBusy || !branch}
              onClick={onToggleOpen}
              className={`h-10 rounded-xl px-3 text-sm font-bold ${branch?.isOpen === false ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"} disabled:opacity-50`}
            >
              {branch?.isOpen === false ? t("panel.closed", "Yopiq") : t("panel.open", "Ochiq")}
            </button>
          )}
          <button type="button" onClick={onSound} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
            {sound ? t("panel.soundOn", "Ovoz yoqilgan") : t("panel.soundOff", "Ovoz o'chiq")}
          </button>
          <button type="button" onClick={onRefresh} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
            {refreshing ? t("panel.refreshing", "Yangilanmoqda...") : t("panel.refresh", "Yangilash")}
          </button>
          <button type="button" onClick={onLogout} className="h-10 rounded-xl px-3 text-sm font-semibold text-slate-500">
            {t("panel.logout", "Chiqish")}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label={t("panel.todayOrders", "Bugungi buyurtmalar")} value={summary?.todayOrders ?? "–"} onClick={onOpenToday} />
        <Stat label={t("panel.todayRevenue", "Tushum")} value={summary ? formatSom(summary.revenue || 0) : "–"} />
        <Stat label={t("panel.rxQueue", "Retsept navbati")} value={summary?.review ?? "–"} onClick={onOpenQueue} />
        <Stat label={t("panel.lowStock", "Kam qoldiq")} value={summary?.lowStock ?? "–"} onClick={onOpenLowStock} />
      </div>
      <div className="flex gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={`h-10 rounded-xl px-4 text-sm font-bold ${tab === id ? "bg-brand text-white" : "bg-white text-slate-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}

function Stat({ label, value, onClick }) {
  const className = "rounded-2xl border border-slate-100 bg-white px-3 py-2 text-left";
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900">{value}</p>
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
