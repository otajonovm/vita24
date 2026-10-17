import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../../lib/format";
import { fetchAdminAudit } from "../../services/api";
import { AdminSkeleton, ErrorState, controlClass } from "./ui";

const ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "ROLE_CHANGED",
  "BRANCH_CREATED",
  "BRANCH_UPDATED",
  "BRANCH_TOGGLED",
  "BRANCH_ARCHIVED",
  "BRANCH_UNARCHIVED",
  "BRANCH_DELETED",
  "LEKKO_KEY_SET",
  "LEKKO_KEY_CLEARED",
  "LEKKO_KEY_CHECK",
  "LEKKO_INTERVAL",
  "STAFF_CREATED",
  "STAFF_UPDATED",
  "STAFF_STATUS",
  "STAFF_DELETED",
  "MEDICINE_CREATED",
  "MEDICINE_UPDATED",
  "MEDICINE_ACTIVATED",
  "MEDICINE_DEACTIVATED",
  "MEDICINE_IMPORT",
  "SHOWCASE_ADDED",
  "SHOWCASE_REMOVED",
  "CATEGORY_CREATED",
  "CATEGORY_UPDATED",
  "CATEGORY_DELETED",
  "PROMO_CREATED",
  "PROMO_UPDATED",
  "PROMO_ACTIVATED",
  "PROMO_DEACTIVATED",
  "PROMO_DELETED",
  "SETTINGS_UPDATED",
  "ORDER_STATUS",
  "PRESCRIPTION_APPROVED",
  "PRESCRIPTION_REJECTED",
  "REFUND_DONE",
  "CUSTOMER_BLOCKED",
  "CUSTOMER_UNBLOCKED",
];

const ENTITIES = ["User", "Branch", "Medicine", "Category", "PromoCode", "ShopSetting", "Order", "SystemSetting"];

const EMPTY = { userId: "", action: "", entityType: "", from: "", to: "", staffOnly: true };

function apiError(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

function showValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function diffRows(before, after) {
  const left = before && typeof before === "object" ? before : {};
  const right = after && typeof after === "object" ? after : {};
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .filter((key) => JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null))
    .map((key) => ({ key, before: left[key], after: right[key] }));
}

export function AuditPanel() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [actors, setActors] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [openId, setOpenId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminAudit({
        page,
        limit: 20,
        ...filters,
        staffOnly: filters.staffOnly !== false,
      });
      setRows(data.items || []);
      setActors((data.actors || []).filter((actor) => filters.staffOnly === false || actor.role !== "CUSTOMER"));
      setTotal(Number(data.total || 0));
      setLimit(Number(data.limit || 20));
    } catch (err) {
      setError(apiError(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, filters]);

  const pages = Math.max(1, Math.ceil(total / limit));

  function apply(event) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">{t("admin.nav.audit")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.auditHint")}</p>
      </div>
      <form onSubmit={apply} className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <label className="grid gap-1 text-xs font-semibold text-slate-600 lg:col-span-2">
          {t("admin.auditUser")}
          <select className={controlClass()} value={draft.userId} onChange={(event) => setDraft((current) => ({ ...current, userId: event.target.value }))}>
            <option value="">{t("admin.auditAny")}</option>
            {actors.map((actor) => (
              <option key={actor.actorId} value={actor.actorId}>
                {actor.actorName || actor.actorId}
                {actor.role ? ` · ${t(`admin.role.${actor.role}`, actor.role)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 text-xs font-semibold text-slate-600 lg:col-span-2">
          <input
            type="checkbox"
            checked={draft.staffOnly !== false}
            onChange={(event) => setDraft((current) => ({ ...current, staffOnly: event.target.checked }))}
          />
          {t("admin.auditStaffOnly")}
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          {t("admin.action")}
          <select className={controlClass()} value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))}>
            <option value="">{t("admin.auditAny")}</option>
            {ACTIONS.map((action) => (
              <option key={action} value={action}>{t(`admin.auditAction.${action}`, { defaultValue: action })}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          {t("admin.auditEntity")}
          <select className={controlClass()} value={draft.entityType} onChange={(event) => setDraft((current) => ({ ...current, entityType: event.target.value }))}>
            <option value="">{t("admin.auditAny")}</option>
            {ENTITIES.map((entity) => (
              <option key={entity} value={entity}>{t(`admin.auditEntityType.${entity}`, { defaultValue: entity })}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          {t("admin.dash.from")}
          <input type="date" className={controlClass()} value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          {t("admin.dash.to")}
          <input type="date" className={controlClass()} value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} />
        </label>
        <div className="flex items-end gap-2 lg:col-span-6">
          <button type="submit" className="h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white">{t("admin.auditApply")}</button>
          <button
            type="button"
            className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold"
            onClick={() => {
              setDraft(EMPTY);
              setPage(1);
              setFilters(EMPTY);
            }}
          >
            {t("admin.auditReset")}
          </button>
        </div>
      </form>
      {error ? <ErrorState title={error} onRetry={load} /> : loading ? <AdminSkeleton /> : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-500">
          <p className="font-bold text-slate-900">{t("admin.auditEmpty")}</p>
          <p className="mt-1">{t("admin.auditEmptyBody")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              const open = openId === row.id;
              const changes = diffRows(row.before, row.after);
              return (
                <li key={row.id} className="px-4 py-3">
                  <button type="button" className="grid w-full gap-1 text-left sm:grid-cols-[11rem_10rem_1fr_auto]" onClick={() => setOpenId(open ? "" : row.id)}>
                    <span className="text-sm text-slate-500">{formatDateTime(row.createdAt)}</span>
                    <span className="text-sm font-semibold text-slate-800">{row.actorName || "—"} <span className="font-medium text-slate-400">{row.role ? t(`admin.role.${row.role}`, row.role) : ""}</span></span>
                    <span className="text-sm text-slate-700">{t(`admin.auditAction.${row.action}`, { defaultValue: row.action })} · {row.summary}</span>
                    <span className="text-xs font-bold text-brand">{t("admin.auditDiff")}</span>
                  </button>
                  {open ? (
                    <div className="mt-3 grid gap-2 text-sm">
                      <p className="text-xs text-slate-500">{t(`admin.auditEntityType.${row.entityType}`, { defaultValue: row.entityType })} · {row.entityId} · {row.ip || "—"}</p>
                      {changes.length === 0 ? <p className="text-slate-500">{t("admin.auditNoDiff")}</p> : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-slate-400">
                                <th className="py-1 pr-3 font-semibold">{t("admin.auditField")}</th>
                                <th className="py-1 pr-3 font-semibold">{t("admin.auditBefore")}</th>
                                <th className="py-1 font-semibold">{t("admin.auditAfter")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changes.map((change) => (
                                <tr key={change.key} className="border-t border-slate-100">
                                  <td className="py-1.5 pr-3 font-semibold text-slate-700">{change.key}</td>
                                  <td className="py-1.5 pr-3 text-red-700">{showValue(change.before)}</td>
                                  <td className="py-1.5 text-emerald-700">{showValue(change.after)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">{total}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} className="h-9 rounded-lg border border-slate-200 px-3 font-bold disabled:opacity-40" onClick={() => setPage((current) => current - 1)}>{t("admin.prev")}</button>
              <span className="grid h-9 place-items-center px-2">{page} / {pages}</span>
              <button type="button" disabled={page >= pages} className="h-9 rounded-lg border border-slate-200 px-3 font-bold disabled:opacity-40" onClick={() => setPage((current) => current + 1)}>{t("admin.next")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
