import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { formatDateTime } from "../../lib/format";
import {
  checkAdminLekkoKey,
  fetchAdminBranches,
  fetchLekkoLogs,
  fetchLekkoSettings,
  saveLekkoSettings,
  syncAdminLekko,
} from "../../services/api";
import { useToastStore } from "../../store/useToastStore";
import { AdminSkeleton, EmptyState, ErrorState, controlClass } from "./ui";

function apiError(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

function latestByBranch(logs) {
  const map = new Map();
  for (const row of logs) {
    if (!map.has(row.branchId)) map.set(row.branchId, row);
  }
  return map;
}

export function LekkoPanel() {
  const { t } = useTranslation();
  const push = useToastStore((state) => state.push);
  const [params] = useSearchParams();
  const errorsOnly = params.get("error") === "1";
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [intervalMinutes, setIntervalMinutes] = useState("10");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingInterval, setSavingInterval] = useState(false);
  const [busy, setBusy] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [branches, settings, journal] = await Promise.all([
        fetchAdminBranches(),
        fetchLekkoSettings(),
        fetchLekkoLogs({ limit: 20 }),
      ]);
      setRows(branches || []);
      setIntervalMinutes(String(settings?.intervalMinutes ?? 10));
      setLogs(journal?.rows || []);
    } catch (err) {
      setError(apiError(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, [t]);

  async function saveInterval(event) {
    event.preventDefault();
    const minutes = Number(intervalMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      push(t("admin.lekkoIntervalInvalid"), "error");
      return;
    }
    setSavingInterval(true);
    try {
      const saved = await saveLekkoSettings(minutes);
      setIntervalMinutes(String(saved.intervalMinutes));
      push(t("admin.lekkoIntervalSaved"));
    } catch (err) {
      push(apiError(err, t("admin.errorTitle")), "error");
    } finally {
      setSavingInterval(false);
    }
  }

  async function run(branch, kind) {
    setBusy(`${kind}:${branch.id}`);
    try {
      if (kind === "check") {
        const result = await checkAdminLekkoKey(branch.id);
        push(t("admin.lekkoCheckOk", { name: result.name || branch.name }));
        if (result.drugStoreId && result.drugStoreId !== branch.lekkoDrugStoreId) {
          setRows((current) => current.map((item) => (item.id === branch.id ? { ...item, lekkoDrugStoreId: result.drugStoreId, lekkoLastError: null } : item)));
        }
      } else {
        const result = await syncAdminLekko(branch.id);
        push(result.message === "O'zgarish yo'q" ? t("admin.lekkoNoChange") : t("admin.lekkoSyncDone", result));
        setRows((current) => current.map((item) => (item.id === branch.id ? { ...item, lastSyncedAt: new Date().toISOString(), lekkoLastError: null } : item)));
      }
    } catch (err) {
      const message = apiError(err, t("admin.errorTitle"));
      push(message, "error");
      if (kind === "check") {
        setRows((current) => current.map((item) => (item.id === branch.id ? { ...item, lekkoLastError: message } : item)));
      } else {
        await load().catch(() => {});
      }
    } finally {
      setBusy("");
    }
  }

  const visible = errorsOnly ? rows.filter((row) => row.lekkoLastError) : rows;
  const latest = latestByBranch(logs);

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{t("admin.nav.lekko")}</h1>
          <p className="mt-1 text-sm text-slate-500">{errorsOnly ? t("admin.dash.lekkoErrorsHint") : t("admin.lekkoHint")}</p>
        </div>
        <form onSubmit={saveInterval} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-600">{t("admin.lekkoInterval")}</span>
            <input
              className={`${controlClass()} w-28`}
              inputMode="numeric"
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(event.target.value)}
              aria-label={t("admin.lekkoInterval")}
            />
          </label>
          <button type="submit" disabled={savingInterval} className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white disabled:opacity-60">
            {savingInterval ? t("admin.saving") : t("common.save")}
          </button>
        </form>
      </div>
      <p className="text-xs text-slate-500">{t("admin.lekkoIntervalHint")}</p>

      {error ? <ErrorState title={error} onRetry={load} /> : loading ? <AdminSkeleton /> : visible.length === 0 ? (
        <EmptyState title={t("admin.emptyTitle")} body={errorsOnly ? t("admin.dash.lekkoErrorsHint") : t("admin.lekkoHint")} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2 pr-3">{t("admin.colName")}</th>
                <th className="pb-2 pr-3">{t("admin.colKey")}</th>
                <th className="pb-2 pr-3">{t("admin.colSync")}</th>
                <th className="pb-2 pr-3">{t("admin.lekkoResult")}</th>
                <th className="pb-2">{t("admin.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const last = latest.get(row.id);
                return (
                  <tr key={row.id} className="border-t border-slate-100 align-top">
                    <td className="py-3 pr-3">
                      <p className="font-bold text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.lekkoDrugStoreId || "—"}</p>
                    </td>
                    <td className="py-3 pr-3">
                      {row.hasLekkoKey ? (row.lekkoKeyLast4 ? t("admin.lekkoMasked", { last4: row.lekkoKeyLast4 }) : "••••") : t("admin.lekkoMissing")}
                    </td>
                    <td className="py-3 pr-3">{row.lastSyncedAt ? formatDateTime(row.lastSyncedAt) : "—"}</td>
                    <td className="py-3 pr-3">
                      {last ? (
                        <p>
                          {t("admin.lekkoCounts", { updated: last.updatedCount, added: last.addedCount, errors: last.errorCount })}
                        </p>
                      ) : "—"}
                      {row.lekkoLastError && <p className="mt-1 text-xs font-semibold text-amber-800">{row.lekkoLastError}</p>}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={!row.hasLekkoKey || Boolean(busy)} onClick={() => run(row, "check")} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-50" title={!row.hasLekkoKey ? t("admin.lekkoNeedKey") : undefined}>
                          {busy === `check:${row.id}` ? t("admin.lekkoChecking") : busy.startsWith("check:") ? t("common.loading") : t("admin.lekkoCheck")}
                        </button>
                        <button type="button" disabled={!row.hasLekkoKey || Boolean(busy)} onClick={() => run(row, "sync")} className="h-10 rounded-xl bg-brand px-3 text-xs font-bold text-white disabled:opacity-50" title={!row.hasLekkoKey ? t("admin.lekkoNeedKey") : undefined}>
                          {busy === `sync:${row.id}` ? t("admin.lekkoSyncing") : busy.startsWith("sync:") ? t("common.loading") : t("admin.lekkoSyncNow")}
                        </button>
                      </div>
                      {!row.hasLekkoKey ? <p className="mt-1 text-xs text-amber-800">{t("admin.lekkoNeedKey")}</p> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-slate-900">{t("admin.lekkoJournal")}</h2>
        {logs.length === 0 ? (
          <div className="mt-3"><EmptyState title={t("admin.lekkoJournalEmpty")} body={t("admin.lekkoJournalHint")} /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-3">{t("admin.colSync")}</th>
                  <th className="pb-2 pr-3">{t("admin.colName")}</th>
                  <th className="pb-2 pr-3">{t("admin.lekkoTrigger")}</th>
                  <th className="pb-2 pr-3">{t("admin.colStatus")}</th>
                  <th className="pb-2">{t("admin.lekkoResult")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-3 pr-3">{formatDateTime(row.finishedAt || row.startedAt)}</td>
                    <td className="py-3 pr-3 font-semibold">{row.branchName}</td>
                    <td className="py-3 pr-3">{t(`admin.lekkoTriggerValue.${row.trigger}`, { defaultValue: row.trigger })}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${row.status === "OK" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                        {t(`admin.lekkoStatus.${row.status}`, { defaultValue: row.status })}
                      </span>
                    </td>
                    <td className="py-3">
                      <p>{t("admin.lekkoCounts", { updated: row.updatedCount, added: row.addedCount, errors: row.errorCount })}</p>
                      {row.message && <p className="text-xs text-slate-500">{row.message}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
