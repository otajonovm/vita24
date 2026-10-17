import { createContext, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToastStore } from "../../store/useToastStore";

const ConfirmContext = createContext(null);

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm AdminLayout ichida ishlatiladi");
  }
  return confirm;
}

export function ConfirmProvider({ children }) {
  const { t } = useTranslation();
  const [state, setState] = useState(null);

  function confirm(options) {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }

  function close(accepted) {
    state?.resolve(accepted);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-4" onClick={() => close(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="admin-confirm-title" className="text-lg font-extrabold text-slate-900">
              {state.title}
            </h2>
            {state.body && <p className="mt-2 text-sm text-slate-600">{state.body}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => close(false)} className="h-10 rounded-xl px-3 text-sm font-bold text-slate-600">
                {state.cancelLabel || t("admin.cancel")}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`h-10 rounded-xl px-3 text-sm font-bold text-white ${state.danger ? "bg-red-600" : "bg-brand"}`}
              >
                {state.confirmLabel || t("admin.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function AdminSkeleton({ rows = 4 }) {
  return (
    <div className="grid gap-3" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

export function EmptyState({ title, body, actionLabel, onAction }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8">
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {body && <p className="max-w-md text-sm text-slate-500">{body}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-1 h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorState({ title, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm font-semibold text-red-700">{title || t("admin.errorTitle")}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="h-10 rounded-xl bg-white px-3 text-sm font-bold text-red-700">
          {t("admin.retry")}
        </button>
      )}
    </div>
  );
}

export function AdminToasts() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  if (!toasts?.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[70] grid w-[min(100%-2rem,22rem)] gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={`pointer-events-auto rounded-xl px-4 py-3 text-left text-sm font-semibold text-white shadow-sm ${
            toast.tone === "error" ? "bg-red-600" : "bg-slate-900"
          }`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, error, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

export function controlClass(invalid) {
  return `h-11 w-full rounded-xl border px-3 text-sm outline-none ring-brand/30 focus:ring-2 ${
    invalid ? "border-red-400" : "border-slate-200"
  }`;
}

export function DataTable({ rows, columns, searchText, rowKey, emptyTitle, emptyBody, emptyAction, onEmptyAction, pageSize = 8 }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = rows || [];
    if (needle) {
      list = list.filter((row) => String(searchText?.(row) || "").toLowerCase().includes(needle));
    }
    if (sortKey) {
      const column = columns.find((item) => item.key === sortKey);
      list = [...list].sort((left, right) => {
        const a = String(column?.sortValue ? column.sortValue(left) : left[sortKey] ?? "");
        const b = String(column?.sortValue ? column.sortValue(right) : right[sortKey] ?? "");
        const compared = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
        return sortDir === "asc" ? compared : -compared;
      });
    }
    return list;
  }, [rows, query, sortKey, sortDir, columns, searchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key) {
    setPage(1);
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
  }

  return (
    <div className="grid gap-3">
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
        placeholder={t("admin.search")}
        aria-label={t("admin.search")}
        className="h-11 w-full max-w-sm rounded-xl border border-slate-200 px-3 text-sm outline-none ring-brand/30 focus:ring-2"
      />
      {slice.length === 0 ? (
        <EmptyState
          title={emptyTitle || t("admin.emptyTitle")}
          body={query.trim() ? t("admin.emptyBody") : emptyBody}
          actionLabel={emptyAction}
          onAction={onEmptyAction}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className="pb-2 pr-3 font-semibold" aria-sort={sortKey === column.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                    {column.sortable === false ? (
                      column.header
                    ) : (
                      <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1 font-semibold">
                        {column.header}
                        {sortKey === column.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={rowKey(row)} className="border-t border-slate-100">
                  {columns.map((column) => (
                    <td key={column.key} className="py-3 pr-3 align-middle text-slate-700">
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > pageSize && (
        <div className="flex items-center justify-end gap-2">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">
            {t("admin.prev")}
          </button>
          <span className="text-xs font-semibold text-slate-500">{t("admin.page", { page: safePage, pages })}</span>
          <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">
            {t("admin.next")}
          </button>
        </div>
      )}
    </div>
  );
}
