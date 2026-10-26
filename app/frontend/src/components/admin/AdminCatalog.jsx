import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { formatSom } from "../../lib/format";
import { resolveMediaUrl } from "../../lib/media";
import {
  confirmMedicineImport,
  createAdminCategory,
  createAdminMedicine,
  deleteAdminCategory,
  downloadMedicineExport,
  fetchAdminCatalog,
  fetchAdminCategories,
  previewMedicineImport,
  setAdminMedicineActive,
  setAdminMedicineRx,
  setAdminMedicineRxBulk,
  updateAdminCategory,
  updateAdminMedicine,
  uploadMedicineImage,
} from "../../services/api";
import { useAdminAuth } from "../../store/useAuthStore";
import { useToastStore } from "../../store/useToastStore";
import { LoadingButton } from "../ui";
import { createRequestGate, isCanceled } from "../../lib/requestGate";
import { AdminSkeleton, ErrorState, controlClass, useConfirm } from "./ui";

function errorText(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

const EMPTY = {
  name: "",
  activeIngredient: "",
  dosage: "",
  dosageForm: "",
  quantityInPack: "1",
  manufacturer: "",
  categoryId: "",
  isPrescription: false,
  barcode: "",
  usage: "",
  contraindications: "",
  storageConditions: "",
  basePrice: "",
};

function payloadFrom(draft) {
  return {
    name: draft.name.trim(),
    activeIngredient: draft.activeIngredient.trim() || null,
    dosage: draft.dosage.trim() || null,
    dosageForm: draft.dosageForm.trim(),
    quantityInPack: Number(draft.quantityInPack),
    manufacturer: draft.manufacturer.trim(),
    categoryId: draft.categoryId,
    isPrescription: draft.isPrescription === true,
    barcode: draft.barcode.trim() || null,
    usage: draft.usage.trim() || null,
    contraindications: draft.contraindications.trim() || null,
    storageConditions: draft.storageConditions.trim() || null,
    basePrice: Number(String(draft.basePrice).replace(/\s/g, "").replace(",", ".")),
  };
}

export function CatalogManager() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const confirm = useConfirm();
  const push = useToastStore((state) => state.push);
  const isSuper = useAdminAuth((state) => state.user?.role) === "SUPER_ADMIN";
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("active");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [exporting, setExporting] = useState("");
  const catalogGate = useRef(createRequestGate());
  const [draft, setDraft] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [progress, setProgress] = useState(0);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [importRows, setImportRows] = useState(null);
  const [importing, setImporting] = useState(false);
  const [rxFilter, setRxFilter] = useState(() => (searchParams.get("rx") === "1" ? "yes" : "all"));
  const [rxStats, setRxStats] = useState(null);
  const [selected, setSelected] = useState([]);
  const [rxBusy, setRxBusy] = useState(false);

  async function loadCategories() {
    setCategoryError("");
    try {
      setCategories(await fetchAdminCategories());
    } catch (err) {
      setCategoryError(errorText(err, t("admin.errorTitle")));
    }
  }

  async function load(nextPage = page, { quiet = false } = {}) {
    const requestId = catalogGate.current.next();
    if (!quiet) setLoading(true);
    setError("");
    try {
      const rxQuery = rxFilter === "yes" || rxFilter === "review"
        ? { prescription: rxFilter }
        : rxFilter === "LEKKO" || rxFilter === "RULE" || rxFilter === "MANUAL"
          ? { prescription: "yes", rxSource: rxFilter }
          : {};
      const data = await fetchAdminCatalog({
        search: search.trim() || undefined,
        categoryId: categoryId || undefined,
        active,
        page: nextPage,
        limit: 20,
        ...rxQuery,
      });
      if (!catalogGate.current.isLatest(requestId)) return;
      setRows(data.items || []);
      setTotal(data.total || 0);
      setPage(data.page || nextPage);
      setRxStats(data.rxStats || null);
      setSelected([]);
    } catch (err) {
      if (isCanceled(err) || !catalogGate.current.isLatest(requestId)) return;
      setError(errorText(err, t("admin.errorTitle")));
    } finally {
      if (!quiet && catalogGate.current.isLatest(requestId)) setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(1), 250);
    return () => window.clearTimeout(timer);
  }, [search, active, categoryId, rxFilter]);

  function openCreate() {
    setFieldErrors({});
    setPreviewUrl("");
    setProgress(0);
    setDraft({ ...EMPTY });
  }

  function openEdit(row) {
    setFieldErrors({});
    setPreviewUrl(row.imageUrl ? resolveMediaUrl(row.imageUrl) : "");
    setProgress(0);
    setDraft({
      ...EMPTY,
      ...row,
      quantityInPack: String(row.quantityInPack || 1),
      basePrice: String(row.basePrice ?? ""),
      categoryId: row.categoryId || row.category?.id || "",
    });
  }

  async function save(event) {
    event.preventDefault();
    const next = {};
    if (!draft.name.trim()) next.name = t("admin.validation.required");
    if (!draft.dosageForm.trim()) next.dosageForm = t("admin.validation.required");
    if (!draft.manufacturer.trim()) next.manufacturer = t("admin.validation.required");
    if (!draft.categoryId) next.categoryId = t("admin.pickCategory");
    const price = Number(String(draft.basePrice).replace(/\s/g, "").replace(",", "."));
    if (String(draft.basePrice).trim() === "" || !Number.isFinite(price) || price < 0) next.basePrice = t("admin.validation.required");
    setFieldErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const body = payloadFrom(draft);
      const saved = draft.id ? await updateAdminMedicine(draft.id, body) : await createAdminMedicine(body);
      push(draft.id ? t("admin.medicineSaved") : t("admin.medicineAdded"));
      setDraft({ ...draft, ...saved, quantityInPack: String(saved.quantityInPack || 1), basePrice: String(saved.basePrice ?? "") });
      await load(page, { quiet: true });
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row) {
    const turningOff = row.isActive;
    const accepted = await confirm({
      title: turningOff ? t("admin.deactivateMedicine") : t("admin.activateMedicine"),
      body: turningOff ? t("admin.deactivateMedicineHint", { name: row.name }) : row.name,
      danger: turningOff,
    });
    if (!accepted) return;
    try {
      const updated = await setAdminMedicineActive(row.id, !turningOff);
      push(turningOff ? t("admin.medicineInactive") : t("admin.medicineActive"));
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, ...updated, isActive: !turningOff } : item)));
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    }
  }

  async function onImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draft?.id) return;
    const local = URL.createObjectURL(file);
    setPreviewUrl(local);
    setProgress(1);
    try {
      const saved = await uploadMedicineImage(draft.id, file, setProgress);
      setPreviewUrl(resolveMediaUrl(saved.imageUrl));
      setProgress(100);
      push(t("admin.imageSaved"));
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
      setProgress(0);
      setPreviewUrl(draft.imageUrl ? resolveMediaUrl(draft.imageUrl) : "");
    } finally {
      URL.revokeObjectURL(local);
    }
  }

  async function addCategory(event) {
    event.preventDefault();
    if (!categoryName.trim() || addingCategory) return;
    setAddingCategory(true);
    try {
      await createAdminCategory({ name: categoryName.trim(), icon: "pill" });
      setCategoryName("");
      await loadCategories();
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setAddingCategory(false);
    }
  }

  async function exportCatalog(format) {
    if (exporting) return;
    setExporting(format);
    try {
      await downloadMedicineExport(format);
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setExporting("");
    }
  }

  async function renameCategory(row) {
    const name = window.prompt(t("admin.colName"), row.name);
    if (!name || name.trim() === row.name) return;
    try {
      await updateAdminCategory(row.id, { name: name.trim() });
      await loadCategories();
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    }
  }

  async function removeCategory(row) {
    const accepted = await confirm({ title: t("admin.deleteCategory"), body: row.name, danger: true });
    if (!accepted) return;
    try {
      await deleteAdminCategory(row.id);
      await loadCategories();
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    }
  }

  async function onImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      setImportRows(await previewMedicineImport(file));
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setImporting(false);
    }
  }

  async function confirmImport() {
    const ready = (importRows?.rows || []).filter((row) => row.ok).map((row) => ({ line: row.line, ...row.data }));
    if (!ready.length) return;
    setImporting(true);
    try {
      const result = await confirmMedicineImport(ready);
      push(t("admin.importDone", result));
      setImportRows(null);
      await load(1);
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setImporting(false);
    }
  }

  async function toggleRx(row) {
    setRxBusy(true);
    try {
      const updated = await setAdminMedicineRx(row.id, !row.isPrescription);
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, ...updated } : item)));
      push(t("admin.rxSaved"));
      await load(page, { quiet: true });
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setRxBusy(false);
    }
  }

  async function bulkRx(isPrescription) {
    if (!selected.length) {
      push(t("admin.rxNoneSelected"), "error");
      return;
    }
    const accepted = await confirm({
      title: isPrescription ? t("admin.rxBulkOn") : t("admin.rxBulkOff"),
      body: t("admin.rxBulkHint", { count: selected.length }),
    });
    if (!accepted) return;
    setRxBusy(true);
    try {
      await setAdminMedicineRxBulk(selected, isPrescription);
      push(t("admin.rxSaved"));
      await load(page, { quiet: true });
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setRxBusy(false);
    }
  }

  function toggleSelected(id) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const pages = Math.max(1, Math.ceil(total / 20));
  const rxOpen = rxFilter !== "all";
  const pageIds = rows.map((row) => row.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{t("admin.nav.catalog")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("admin.catalogManageHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCategoriesOpen(true)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold">{t("admin.categories")}</button>
          <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-slate-200 px-3 text-sm font-bold">
            {t("admin.import")}
            <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={onImportFile} />
          </label>
          <LoadingButton type="button" loading={exporting === "xlsx"} loadingText={t("common.loading")} onClick={() => exportCatalog("xlsx")} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold disabled:opacity-50">{t("admin.exportExcel")}</LoadingButton>
          <LoadingButton type="button" loading={exporting === "csv"} loadingText={t("common.loading")} onClick={() => exportCatalog("csv")} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold disabled:opacity-50">{t("admin.exportCsv")}</LoadingButton>
          <button type="button" onClick={() => setRxFilter(rxOpen ? "all" : "yes")} className={`h-10 rounded-xl px-3 text-sm font-bold ${rxOpen ? "bg-amber-500 text-white" : "border border-amber-300 text-amber-800"}`}>{t("admin.rxView")}</button>
          <button type="button" onClick={openCreate} className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white">{t("admin.newMedicine")}</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.search")} aria-label={t("admin.search")} className="h-11 min-w-52 rounded-xl border border-slate-200 px-3 text-sm" />
        <select aria-label={t("admin.colStatus")} value={active} onChange={(event) => setActive(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
          <option value="active">{t("admin.customerStatus.ACTIVE")}</option>
          <option value="inactive">{t("admin.inactive")}</option>
          <option value="all">{t("admin.allStatuses")}</option>
        </select>
        <select aria-label={t("admin.category")} value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
          <option value="">{t("admin.allCategories")}</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      {rxStats && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-extrabold text-slate-900">{t("admin.rxCount", { count: rxStats.rxCount || 0 })}</span>
          <span className="text-slate-600">{t("admin.rxSourceLEKKO")}: {rxStats.bySource?.LEKKO || 0}</span>
          <span className="text-slate-600">{t("admin.rxSourceRULE")}: {rxStats.bySource?.RULE || 0}</span>
          <span className="text-slate-600">{t("admin.rxSourceMANUAL")}: {rxStats.bySource?.MANUAL || 0}</span>
          <button type="button" onClick={() => setRxFilter("review")} className="font-bold text-amber-900">{t("admin.rxReviewCount", { count: rxStats.reviewCount || 0 })}</button>
        </div>
      )}
      {rxOpen && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t("admin.rxSourceFilter")} value={rxFilter} onChange={(event) => setRxFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
            <option value="yes">{t("admin.rxSourceAll")}</option>
            <option value="LEKKO">{t("admin.rxSourceLEKKO")}</option>
            <option value="RULE">{t("admin.rxSourceRULE")}</option>
            <option value="MANUAL">{t("admin.rxSourceMANUAL")}</option>
            <option value="review">{t("admin.rxReview")}</option>
          </select>
          <button type="button" disabled={rxBusy} onClick={() => bulkRx(true)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold disabled:opacity-50">{t("admin.rxBulkOn")}</button>
          <button type="button" disabled={rxBusy} onClick={() => bulkRx(false)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold disabled:opacity-50">{t("admin.rxBulkOff")}</button>
        </div>
      )}
      {categoryError ? <ErrorState title={categoryError} onRetry={loadCategories} /> : null}
      {error ? <ErrorState title={error} onRetry={() => load(page)} /> : null}
      {loading ? <AdminSkeleton /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {rxOpen && (
                  <th className="pb-2 pr-3">
                    <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : pageIds)} aria-label={t("admin.rxBulkOn")} />
                  </th>
                )}
                <th className="pb-2 pr-3">{t("admin.colName")}</th>
                <th className="pb-2 pr-3">{t("admin.category")}</th>
                <th className="pb-2 pr-3">{t("admin.basePrice")}</th>
                <th className="pb-2 pr-3">{t("admin.colStatus")}</th>
                <th className="pb-2">{t("admin.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={rxOpen ? 6 : 5} className="py-6 text-slate-500">{t("admin.catalogEmpty")}</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  {rxOpen && (
                    <td className="py-3 pr-3">
                      <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelected(row.id)} aria-label={row.name} />
                    </td>
                  )}
                  <td className="py-3 pr-3">
                    <p className="font-semibold text-slate-900">
                      {row.name}
                      {row.isPrescription && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">Rx</span>}
                      {row.rxNeedsReview && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{t("admin.rxReview")}</span>}
                    </p>
                    <p className="text-xs text-slate-500">{[row.dosage, row.manufacturer, row.rxSource].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="py-3 pr-3">{row.category?.name || "—"}</td>
                  <td className="py-3 pr-3">{formatSom(row.basePrice)}</td>
                  <td className="py-3 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {row.isActive ? t("admin.customerStatus.ACTIVE") : t("admin.inactive")}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openEdit(row)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold">{t("admin.edit")}</button>
                      {rxOpen && (
                        <button type="button" disabled={rxBusy} onClick={() => toggleRx(row)} className="h-10 rounded-xl border border-rose-200 px-3 text-xs font-bold text-rose-700 disabled:opacity-50">
                          {row.isPrescription ? t("admin.rxToggleOff") : t("admin.rxToggleOn")}
                        </button>
                      )}
                      <button type="button" onClick={() => toggleActive(row)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold">
                        {row.isActive ? t("admin.deactivateMedicine") : t("admin.activateMedicine")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" disabled={page <= 1} onClick={() => load(page - 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{t("admin.prev")}</button>
              <span className="self-center text-xs font-semibold text-slate-500">{t("admin.page", { page, pages })}</span>
              <button type="button" disabled={page >= pages} onClick={() => load(page + 1)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{t("admin.next")}</button>
            </div>
          )}
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setDraft(null)}>
          <form noValidate onSubmit={save} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-sm" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold">{draft.id ? t("admin.editMedicine") : t("admin.newMedicine")}</h2>
              <button type="button" onClick={() => setDraft(null)} aria-label={t("common.close")} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={t("admin.colName")} error={fieldErrors.name}><input className={controlClass(fieldErrors.name)} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
              <Field label={t("admin.activeIngredient")}><input className={controlClass()} value={draft.activeIngredient} onChange={(event) => setDraft({ ...draft, activeIngredient: event.target.value })} /></Field>
              <Field label={t("admin.dosage")}><input className={controlClass()} value={draft.dosage} onChange={(event) => setDraft({ ...draft, dosage: event.target.value })} /></Field>
              <Field label={t("admin.dosageForm")} error={fieldErrors.dosageForm}><input className={controlClass(fieldErrors.dosageForm)} value={draft.dosageForm} onChange={(event) => setDraft({ ...draft, dosageForm: event.target.value })} /></Field>
              <Field label={t("admin.packCount")}><input className={controlClass()} inputMode="numeric" value={draft.quantityInPack} onChange={(event) => setDraft({ ...draft, quantityInPack: event.target.value })} /></Field>
              <Field label={t("admin.colMaker")} error={fieldErrors.manufacturer}><input className={controlClass(fieldErrors.manufacturer)} value={draft.manufacturer} onChange={(event) => setDraft({ ...draft, manufacturer: event.target.value })} /></Field>
              <Field label={t("admin.category")} error={fieldErrors.categoryId}>
                <select className={controlClass(fieldErrors.categoryId)} value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}>
                  <option value="">{t("admin.pickCategory")}</option>
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field label={t("admin.basePrice")} error={fieldErrors.basePrice}>
                <input className={controlClass(fieldErrors.basePrice)} inputMode="decimal" value={draft.basePrice} onChange={(event) => setDraft({ ...draft, basePrice: event.target.value })} />
                <span className="text-xs text-slate-500">{t("admin.basePriceHint")}</span>
              </Field>
              <Field label={t("admin.barcode")}><input className={controlClass()} value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} /></Field>
              <label className="flex items-center gap-2 self-end text-sm font-semibold">
                <input type="checkbox" checked={draft.isPrescription} onChange={(event) => setDraft({ ...draft, isPrescription: event.target.checked })} />
                {t("admin.prescriptionFlag")}
              </label>
              <Field label={t("admin.usage")}><textarea className={`${controlClass()} h-auto py-2`} rows={3} value={draft.usage} onChange={(event) => setDraft({ ...draft, usage: event.target.value })} /></Field>
              <Field label={t("admin.contraindications")}><textarea className={`${controlClass()} h-auto py-2`} rows={3} value={draft.contraindications} onChange={(event) => setDraft({ ...draft, contraindications: event.target.value })} /></Field>
              <Field label={t("admin.storage")}><input className={controlClass()} value={draft.storageConditions} onChange={(event) => setDraft({ ...draft, storageConditions: event.target.value })} /></Field>
            </div>
            {isSuper && (
              <div className="mt-4 grid gap-2 rounded-xl border border-slate-100 p-3">
                <p className="text-sm font-bold">{t("admin.image")}</p>
                {previewUrl && <img src={previewUrl} alt="" className="h-28 w-28 rounded-xl object-cover" />}
                {draft.id ? (
                  <label className="inline-flex h-10 w-fit cursor-pointer items-center rounded-xl border border-slate-200 px-3 text-sm font-bold">
                    {t("admin.uploadImage")}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onImage} />
                  </label>
                ) : (
                  <p className="text-xs text-slate-500">{t("admin.imageAfterSave")}</p>
                )}
                {progress > 0 && (
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-brand" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={saving} className="h-10 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? t("admin.saving") : t("common.save")}</button>
            </div>
          </form>
        </div>
      )}

      {categoriesOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setCategoriesOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">{t("admin.categories")}</h2>
              <button type="button" onClick={() => setCategoriesOpen(false)} aria-label={t("common.close")}><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={addCategory} className="mt-3 flex gap-2">
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder={t("admin.colName")} aria-label={t("admin.colName")} className={controlClass()} />
              <LoadingButton type="submit" loading={addingCategory} loadingText={t("common.saving")} className="h-11 rounded-xl bg-brand px-3 text-sm font-bold text-white disabled:opacity-50">{t("admin.add")}</LoadingButton>
            </form>
            <ul className="mt-3 grid gap-2">
              {categories.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
                  <span>{row.name} <span className="text-slate-400">({row.medicineCount})</span></span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => renameCategory(row)} className="font-bold text-slate-600">{t("admin.edit")}</button>
                    <button type="button" onClick={() => removeCategory(row)} className="font-bold text-red-600">{t("admin.delete")}</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {importRows && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setImportRows(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-extrabold">{t("admin.importPreview")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("admin.importSummary", importRows)}</p>
            <ul className="mt-3 grid max-h-80 gap-2 overflow-y-auto">
              {importRows.rows.slice(0, 80).map((row) => (
                <li key={row.line} className={`rounded-xl px-3 py-2 text-sm ${row.ok ? "bg-emerald-50" : "bg-red-50"}`}>
                  <span className="font-bold">{row.line}. {row.data?.name || "—"}</span>
                  <span className="ml-2">{row.ok ? (row.action === "update" ? t("admin.importUpdate") : t("admin.importCreate")) : row.errors.join("; ")}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setImportRows(null)} className="h-10 rounded-xl px-3 text-sm font-bold text-slate-600">{t("admin.cancel")}</button>
              <button type="button" disabled={importing || (!importRows.createCount && !importRows.updateCount)} onClick={confirmImport} className="h-10 rounded-xl bg-brand px-3 text-sm font-bold text-white disabled:opacity-50">
                {importing ? t("admin.saving") : t("admin.importConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}
