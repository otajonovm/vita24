import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { formatDateTime, formatSom } from "../../lib/format";
import { fetchAdminBranches, fetchNetworkStock, fetchAdminStockMovements, updateAdminBranch } from "../../services/api";
import { useToastStore } from "../../store/useToastStore";
import { AdminSkeleton, ErrorState } from "./ui";

function errorText(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

export function NetworkStock() {
  const { t } = useTranslation();
  const push = useToastStore((state) => state.push);
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("low") === "1" ? "network" : "network");
  const [filter, setFilter] = useState(params.get("low") === "1" ? "low" : "all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [thresholds, setThresholds] = useState({});
  const [branchOptions, setBranchOptions] = useState([]);
  const [moves, setMoves] = useState(null);
  const [moveSearch, setMoveSearch] = useState("");
  const [moveBranch, setMoveBranch] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [movePage, setMovePage] = useState(1);

  async function load(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchNetworkStock({ search: search.trim() || undefined, filter, page: nextPage, limit: 20 });
      setData(result);
      setPage(result.page || nextPage);
      setThresholds(Object.fromEntries((result.branches || []).map((branch) => [branch.id, String(branch.lowStockThreshold)])));
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  async function loadMoves(nextPage = movePage) {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAdminStockMovements({
        search: moveSearch.trim() || undefined,
        branchId: moveBranch || undefined,
        reason: moveReason.trim() || undefined,
        page: nextPage,
        limit: 20,
      });
      setMoves(result);
      setMovePage(result.page || nextPage);
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAdminBranches()
      .then((list) => setBranchOptions((list || []).filter((branch) => branch.status !== "archived")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "network") return undefined;
    const timer = window.setTimeout(() => load(1), 250);
    return () => window.clearTimeout(timer);
  }, [search, filter, tab]);

  useEffect(() => {
    if (tab !== "moves") return undefined;
    const timer = window.setTimeout(() => loadMoves(1), 250);
    return () => window.clearTimeout(timer);
  }, [moveSearch, moveBranch, moveReason, tab]);

  async function saveThreshold(branchId) {
    const value = Number(thresholds[branchId]);
    if (!Number.isInteger(value) || value < 1) {
      push(t("admin.thresholdInvalid"), "error");
      return;
    }
    try {
      await updateAdminBranch(branchId, { lowStockThreshold: value });
      push(t("admin.thresholdSaved"));
      await load(page);
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    }
  }

  const branches = data?.branches || [];
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 20));
  const movePages = Math.max(1, Math.ceil((moves?.total || 0) / 20));

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{t("admin.nav.stock")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("admin.networkHint")}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("network")} className={`h-10 rounded-xl px-3 text-sm font-bold ${tab === "network" ? "bg-brand text-white" : "border border-slate-200"}`}>{t("admin.network")}</button>
          <button type="button" onClick={() => setTab("moves")} className={`h-10 rounded-xl px-3 text-sm font-bold ${tab === "moves" ? "bg-brand text-white" : "border border-slate-200"}`}>{t("admin.movements")}</button>
        </div>
      </div>

      {tab === "network" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.search")} aria-label={t("admin.search")} className="h-11 min-w-52 rounded-xl border border-slate-200 px-3 text-sm" />
            <select aria-label={t("admin.colStatus")} value={filter} onChange={(event) => setFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
              <option value="all">{t("admin.allStock")}</option>
              <option value="low">{t("admin.lowStock")}</option>
              <option value="out">{t("admin.outStock")}</option>
            </select>
          </div>
          {error ? <ErrorState title={error} onRetry={() => load(page)} /> : loading ? <AdminSkeleton /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="sticky left-0 bg-white pb-2 pr-3">{t("admin.colName")}</th>
                    {branches.map((branch) => (
                      <th key={branch.id} className="pb-2 pr-3 font-semibold">
                        <div className="grid gap-1 normal-case">
                          <span>{branch.name}</span>
                          <span className="flex items-center gap-1" title={t("admin.thresholdTooltip")}>
                            <span className="sr-only">{t("admin.threshold")}</span>
                            <input
                              aria-label={t("admin.threshold")}
                              title={t("admin.thresholdTooltip")}
                              value={thresholds[branch.id] || ""}
                              onChange={(event) => setThresholds({ ...thresholds, [branch.id]: event.target.value })}
                              className="h-8 w-16 rounded-lg border border-slate-200 px-2 text-xs"
                            />
                            <button type="button" onClick={() => saveThreshold(branch.id)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs font-bold" title={t("admin.thresholdTooltip")}>{t("common.save")}</button>
                          </span>
                          <span className="text-[10px] font-medium normal-case text-slate-400" title={t("admin.thresholdTooltip")}>{t("admin.threshold")}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.items || []).length === 0 ? (
                    <tr><td className="py-6 text-slate-500" colSpan={branches.length + 1}>{t("admin.networkEmpty")}</td></tr>
                  ) : (data.items || []).map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="sticky left-0 bg-white py-3 pr-3">
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">{t("admin.basePrice")}: {formatSom(row.basePrice)}</p>
                      </td>
                      {branches.map((branch) => {
                        const cell = row.cells?.[branch.id];
                        const tone = !cell ? "" : cell.out ? "bg-red-50" : cell.low ? "bg-amber-50" : "";
                        return (
                          <td key={branch.id} className={`py-3 pr-3 ${tone}`}>
                            {cell ? (
                              <>
                                <p className="font-bold">{cell.available}</p>
                                <p className={`text-xs ${cell.priceDiffers ? "font-bold text-amber-800" : "text-slate-500"}`}>
                                  {formatSom(cell.price)}{cell.priceDiffers ? " *" : ""}
                                </p>
                              </>
                            ) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-500">{t("admin.priceDiffHint")}</p>
              {pages > 1 && (
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => load(page - 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{t("admin.prev")}</button>
                  <span className="self-center text-xs text-slate-500">{t("admin.page", { page, pages })}</span>
                  <button type="button" disabled={page >= pages} onClick={() => load(page + 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{t("admin.next")}</button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <input value={moveSearch} onChange={(event) => setMoveSearch(event.target.value)} placeholder={t("admin.search")} aria-label={t("admin.search")} className="h-11 min-w-52 rounded-xl border border-slate-200 px-3 text-sm" />
            <select aria-label={t("admin.colBranch")} value={moveBranch} onChange={(event) => setMoveBranch(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
              <option value="">{t("admin.allBranches")}</option>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <input value={moveReason} onChange={(event) => setMoveReason(event.target.value)} placeholder={t("admin.reason")} aria-label={t("admin.reason")} className="h-11 w-40 rounded-xl border border-slate-200 px-3 text-sm" />
          </div>
          {error ? <ErrorState title={error} onRetry={() => loadMoves(movePage)} /> : loading ? <AdminSkeleton /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="pb-2 pr-3">{t("admin.colDate")}</th>
                    <th className="pb-2 pr-3">{t("admin.colName")}</th>
                    <th className="pb-2 pr-3">{t("admin.colBranch")}</th>
                    <th className="pb-2 pr-3">{t("admin.delta")}</th>
                    <th className="pb-2 pr-3">{t("admin.reason")}</th>
                    <th className="pb-2">{t("admin.actor")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(moves?.items || []).length === 0 ? (
                    <tr><td colSpan={6} className="py-6 text-slate-500">{t("admin.noMovements")}</td></tr>
                  ) : moves.items.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="py-3 pr-3">{formatDateTime(row.createdAt)}</td>
                      <td className="py-3 pr-3 font-semibold">{row.medicineName}</td>
                      <td className="py-3 pr-3">{row.branchName}</td>
                      <td className="py-3 pr-3">{row.beforeCount ?? "—"} → {row.afterCount ?? "—"} ({row.delta > 0 ? `+${row.delta}` : row.delta})</td>
                      <td className="py-3 pr-3">{row.reason}{row.note ? ` · ${row.note}` : ""}</td>
                      <td className="py-3">{row.actorName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {movePages > 1 && (
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" disabled={movePage <= 1} onClick={() => loadMoves(movePage - 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{t("admin.prev")}</button>
                  <span className="self-center text-xs text-slate-500">{t("admin.page", { page: movePage, pages: movePages })}</span>
                  <button type="button" disabled={movePage >= movePages} onClick={() => loadMoves(movePage + 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{t("admin.next")}</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
