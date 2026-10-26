import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { formatDateTime, formatSom } from "../../lib/format";
import {
  createAdminPromo,
  deleteAdminPromo,
  fetchAdminBranches,
  fetchAdminPromos,
  setAdminPromoActive,
  updateAdminPromo,
} from "../../services/api";
import { useToastStore } from "../../store/useToastStore";
import { LoadingButton } from "../ui";
import { AdminSkeleton, EmptyState, ErrorState, controlClass, useConfirm } from "./ui";

function errorText(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const EMPTY = {
  code: "",
  type: "PERCENT",
  value: "",
  maxDiscount: "",
  minSubtotal: "0",
  usageLimit: "",
  perUserLimit: "",
  startsAt: "",
  expiresAt: "",
  active: true,
  allBranches: true,
  branchIds: [],
};

function draftFrom(row) {
  return {
    ...EMPTY,
    ...row,
    value: String(row.value ?? ""),
    maxDiscount: row.maxDiscount == null ? "" : String(row.maxDiscount),
    minSubtotal: String(row.minSubtotal ?? 0),
    usageLimit: row.usageLimit == null ? "" : String(row.usageLimit),
    perUserLimit: row.perUserLimit == null ? "" : String(row.perUserLimit),
    startsAt: toLocalInput(row.startsAt),
    expiresAt: toLocalInput(row.expiresAt),
    branchIds: row.branchIds || [],
  };
}

function payloadFrom(draft) {
  return {
    code: draft.code.trim(),
    type: draft.type,
    value: Number(String(draft.value).replace(",", ".")),
    maxDiscount: draft.maxDiscount === "" ? null : Number(String(draft.maxDiscount).replace(",", ".")),
    minSubtotal: Number(String(draft.minSubtotal || 0).replace(",", ".")),
    usageLimit: draft.usageLimit === "" ? null : Number(draft.usageLimit),
    perUserLimit: draft.perUserLimit === "" ? null : Number(draft.perUserLimit),
    startsAt: fromLocalInput(draft.startsAt),
    expiresAt: fromLocalInput(draft.expiresAt),
    active: draft.active === true,
    allBranches: draft.allBranches === true,
    branchIds: draft.allBranches ? [] : draft.branchIds,
  };
}

export function PromoManager() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const push = useToastStore((state) => state.push);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [promos, branchList] = await Promise.all([fetchAdminPromos(), fetchAdminBranches()]);
      setRows(promos || []);
      setBranches((branchList || []).filter((branch) => branch.status !== "archived"));
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, [t]);

  function toggleBranch(id) {
    setDraft((current) => {
      const has = current.branchIds.includes(id);
      return {
        ...current,
        branchIds: has ? current.branchIds.filter((item) => item !== id) : [...current.branchIds, id],
      };
    });
  }

  async function save(event) {
    event.preventDefault();
    const body = payloadFrom(draft);
    if (!body.code || !Number.isFinite(body.value) || body.value <= 0) {
      push(t("admin.validation.required"), "error");
      return;
    }
    setSaving(true);
    try {
      if (draft.id) await updateAdminPromo(draft.id, body);
      else await createAdminPromo(body);
      push(draft.id ? t("admin.promoSaved") : t("admin.promoAdded"));
      setDraft(null);
      await load();
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    if (rowBusy) return;
    setRowBusy(`toggle:${row.id}`);
    try {
      await setAdminPromoActive(row.id, !row.active);
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, active: !row.active } : item)));
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setRowBusy("");
    }
  }

  async function remove(row) {
    const accepted = await confirm({ title: t("admin.delete"), body: row.code, danger: true });
    if (!accepted) return;
    setRowBusy(`delete:${row.id}`);
    try {
      await deleteAdminPromo(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setRowBusy("");
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{t("admin.nav.promos")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("admin.promoHint")}</p>
        </div>
        <button type="button" onClick={() => setDraft({ ...EMPTY })} className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white">
          {t("admin.newPromo")}
        </button>
      </div>
      {error ? <ErrorState title={error} onRetry={load} /> : loading ? <AdminSkeleton /> : rows.length === 0 ? (
        <EmptyState title={t("admin.promosEmpty")} body={t("admin.promosEmptyBody")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2 pr-3">{t("admin.promoCode")}</th>
                <th className="pb-2 pr-3">{t("admin.promoType")}</th>
                <th className="pb-2 pr-3">{t("admin.promoValue")}</th>
                <th className="pb-2 pr-3">{t("admin.promoUsed")}</th>
                <th className="pb-2 pr-3">{t("admin.promoDiscountGiven")}</th>
                <th className="pb-2 pr-3">{t("admin.colStatus")}</th>
                <th className="pb-2">{t("admin.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-3 pr-3">
                    <p className="font-bold text-slate-900">{row.code}</p>
                    <p className="text-xs text-slate-500">
                      {row.expiresAt ? formatDateTime(row.expiresAt) : t("admin.promoUnlimited")}
                    </p>
                  </td>
                  <td className="py-3 pr-3">{row.type === "PERCENT" ? t("admin.promoPercent") : t("admin.promoAmount")}</td>
                  <td className="py-3 pr-3">{row.type === "PERCENT" ? `${row.value}%` : formatSom(row.value)}</td>
                  <td className="py-3 pr-3">{row.usedCount}{row.usageLimit != null ? ` / ${row.usageLimit}` : ""}</td>
                  <td className="py-3 pr-3">{formatSom(row.totalDiscount)}</td>
                  <td className="py-3 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${row.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {row.active ? t("admin.customerStatus.ACTIVE") : t("admin.inactive")}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setDraft(draftFrom(row))} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold">{t("admin.edit")}</button>
                      <LoadingButton type="button" loading={rowBusy === `toggle:${row.id}`} loadingText={t("common.saving")} onClick={() => toggleActive(row)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-50">
                        {row.active ? t("admin.deactivate") : t("admin.activate")}
                      </LoadingButton>
                      {row.usedCount === 0 && (
                        <LoadingButton type="button" loading={rowBusy === `delete:${row.id}`} loadingText={t("common.saving")} onClick={() => remove(row)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-red-600 disabled:opacity-50">{t("admin.delete")}</LoadingButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setDraft(null)}>
          <form noValidate onSubmit={save} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold">{draft.id ? t("admin.editPromo") : t("admin.newPromo")}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label={t("common.close")} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={t("admin.promoCode")}><input className={controlClass()} value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} /></Field>
              <Field label={t("admin.promoType")}>
                <select className={controlClass()} value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                  <option value="PERCENT">{t("admin.promoPercent")}</option>
                  <option value="AMOUNT">{t("admin.promoAmount")}</option>
                </select>
              </Field>
              <Field label={t("admin.promoValue")}><input className={controlClass()} inputMode="decimal" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} /></Field>
              <Field label={t("admin.promoMax")}><input className={controlClass()} inputMode="decimal" value={draft.maxDiscount} onChange={(event) => setDraft({ ...draft, maxDiscount: event.target.value })} /></Field>
              <Field label={t("admin.promoMin")}><input className={controlClass()} inputMode="decimal" value={draft.minSubtotal} onChange={(event) => setDraft({ ...draft, minSubtotal: event.target.value })} /></Field>
              <Field label={t("admin.promoUsageLimit")}><input className={controlClass()} inputMode="numeric" value={draft.usageLimit} onChange={(event) => setDraft({ ...draft, usageLimit: event.target.value })} placeholder={t("admin.promoUnlimited")} /></Field>
              <Field label={t("admin.promoUserLimit")}><input className={controlClass()} inputMode="numeric" value={draft.perUserLimit} onChange={(event) => setDraft({ ...draft, perUserLimit: event.target.value })} placeholder={t("admin.promoUnlimited")} /></Field>
              <Field label={t("admin.promoStarts")}><input type="datetime-local" className={controlClass()} value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></Field>
              <Field label={t("admin.promoEnds")}><input type="datetime-local" className={controlClass()} value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
                {t("admin.customerStatus.ACTIVE")}
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={draft.allBranches} onChange={(event) => setDraft({ ...draft, allBranches: event.target.checked, branchIds: event.target.checked ? [] : draft.branchIds })} />
                {t("admin.promoAllBranches")}
              </label>
            </div>
            {!draft.allBranches && (
              <div className="mt-3 grid gap-2">
                <p className="text-xs font-semibold text-slate-600">{t("admin.promoBranches")}</p>
                {branches.map((branch) => (
                  <label key={branch.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={draft.branchIds.includes(branch.id)} onChange={() => toggleBranch(branch.id)} />
                    {branch.name}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={saving} className="h-10 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? t("admin.saving") : t("common.save")}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
