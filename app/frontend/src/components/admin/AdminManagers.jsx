import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Pencil, Plus, X } from "lucide-react";
import { formatDateTime, formatSom } from "../../lib/format";
import { slugify } from "../../lib/slug";
import {
  archiveAdminBranch,
  clearAdminLekkoKey,
  createAdminBranch,
  createPharmacist,
  deleteAdminBranch,
  deletePharmacist,
  fetchAdminBranches,
  fetchPharmacists,
  setPharmacistStatus,
  toggleAdminBranch,
  unarchiveAdminBranch,
  updateAdminBranch,
  updatePharmacist,
} from "../../services/api";
import { useToastStore } from "../../store/useToastStore";
import BranchMap from "./BranchMap";
import { AdminSkeleton, DataTable, ErrorState, controlClass, useConfirm } from "./ui";
import { LoadingButton } from "../ui";

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function defaultDay() {
  return { open: "08:00", close: "23:00", closed: false };
}

function defaultHours() {
  return { allDay: false, ...Object.fromEntries(WEEK.map((key) => [key, defaultDay()])) };
}

function hoursFromBranch(branch) {
  const source = branch?.hours?.allDay
    ? { allDay: true }
    : branch?.hours?.mon
      ? branch.hours
      : null;
  return {
    allDay: Boolean(source?.allDay),
    ...Object.fromEntries(WEEK.map((key) => [key, { ...defaultDay(), ...(source?.[key] || {}) }])),
  };
}

const emptyBranch = {
  name: "",
  slug: "",
  slugTouched: false,
  address: "",
  phone: "+998",
  district: "",
  ...defaultHours(),
  lat: null,
  lng: null,
  deliveryRadiusKm: 5,
  lekkoApiKey: "",
  lekkoDrugStoreId: "",
  isActive: true,
};

const emptyPharmacist = {
  fullName: "",
  phone: "+998",
  password: "",
  branchId: "",
  role: "BRANCH_ADMIN",
};

function staffPasswordOk(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value);
}

function errorText(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
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

function Modal({ title, onClose, wide = false, children }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${wide ? "max-w-2xl" : "max-w-lg"}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Yopish" className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-3">{children}</div>
      </div>
    </div>
  );
}

export function BranchManager() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const closedOnly = params.get("closed") === "1";
  const confirm = useConfirm();
  const push = useToastStore((state) => state.push);
  const [statusFilter, setStatusFilter] = useState(closedOnly ? "all" : "current");
  const [branches, setBranches] = useState([]);
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [keyMeta, setKeyMeta] = useState({ hasLekkoKey: false, lekkoKeyLast4: "" });
  const [replacingKey, setReplacingKey] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  async function load() {
    setLoadError("");
    setBranches((await fetchAdminBranches()) || []);
  }

  useEffect(() => {
    load()
      .catch((err) => setLoadError(errorText(err, t("admin.errorTitle"))))
      .finally(() => setLoading(false));
  }, [t]);

  function openCreate() {
    setEditingId("");
    setKeyMeta({ hasLekkoKey: false, lekkoKeyLast4: "" });
    setReplacingKey(false);
    setDraft({ ...emptyBranch, ...hoursFromBranch(null) });
    setError("");
  }

  function openEdit(branch) {
    setEditingId(branch.id);
    setKeyMeta({
      hasLekkoKey: Boolean(branch.hasLekkoKey),
      lekkoKeyLast4: branch.lekkoKeyLast4 || "",
    });
    setReplacingKey(false);
    setDraft({
      name: branch.name || "",
      slug: branch.slug || "",
      slugTouched: true,
      address: branch.address || "",
      phone: branch.phone || "+998",
      district: branch.district || "",
      ...hoursFromBranch(branch),
      lat: branch.lat ?? null,
      lng: branch.lng ?? null,
      deliveryRadiusKm: branch.deliveryRadiusKm || 5,
      lekkoApiKey: "",
      lekkoDrugStoreId: branch.lekkoDrugStoreId ?? "",
      isActive: branch.isActive !== false,
    });
    setError("");
  }

  function payloadFromDraft() {
    const hours = draft.allDay
      ? { allDay: true }
      : Object.fromEntries(WEEK.map((key) => [key, draft[key]]));
    const payload = {
      name: draft.name.trim(),
      address: draft.address.trim(),
      phone: draft.phone.trim(),
      district: draft.district.trim() || "Toshkent",
      workingHours: hours,
      lat: draft.lat,
      lng: draft.lng,
      deliveryRadiusKm: Math.min(50, Math.max(1, Number(draft.deliveryRadiusKm) || 5)),
      lekkoDrugStoreId: draft.lekkoDrugStoreId === "" ? null : Number(draft.lekkoDrugStoreId),
      isActive: Boolean(draft.isActive),
    };
    if (draft.slugTouched) payload.slug = draft.slug.trim();
    const key = draft.lekkoApiKey.trim();
    const canSetKey = !editingId || replacingKey || !keyMeta.hasLekkoKey;
    if (canSetKey && key) payload.lekkoApiKey = key;
    return payload;
  }

  async function save(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!draft.name.trim()) nextErrors.name = t("admin.validation.required");
    if (!draft.address.trim()) nextErrors.address = t("admin.validation.required");
    if (!/^\+998\d{9}$/.test(draft.phone.trim())) nextErrors.phone = t("admin.phoneFormat");
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editingId) {
        await updateAdminBranch(editingId, payloadFromDraft());
        setNotice("Filial yangilandi");
        push("Filial yangilandi");
      } else {
        await createAdminBranch(payloadFromDraft());
        setNotice("Filial qo'shildi");
        push("Filial qo'shildi");
      }
      setDraft(null);
      await load();
    } catch (err) {
      setError(errorText(err, "Saqlanmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    if (!editingId) return;
    const ok = await confirm({
      title: t("admin.lekkoDelete"),
      body: t("admin.lekkoDeleteConfirm"),
      confirmLabel: t("admin.lekkoDelete"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await clearAdminLekkoKey(editingId);
      setKeyMeta({ hasLekkoKey: false, lekkoKeyLast4: "" });
      setReplacingKey(false);
      setDraft((current) => ({ ...current, lekkoApiKey: "" }));
      setBranches((current) => current.map((item) => (item.id === editingId ? updated : item)));
      setNotice(t("admin.lekkoMissing"));
    } catch (err) {
      setError(errorText(err, t("admin.securityLoadFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(branch) {
    const turningOff = branch.isActive && branch.status !== "archived";
    const count = Number(branch.activeOrders || 0);
    const ok = await confirm({
      title: turningOff ? t("admin.deactivate") : t("admin.activate"),
      body: turningOff
        ? count > 0
          ? t("admin.activeOrdersWarn", { count })
          : t("admin.deactivateHint")
        : t("admin.activateHint"),
      confirmLabel: turningOff ? t("admin.deactivate") : t("admin.activate"),
      danger: turningOff,
    });
    if (!ok) return;
    setError("");
    setNotice("");
    try {
      await toggleAdminBranch(branch.id);
      await load();
      push(turningOff ? t("admin.deactivated") : t("admin.activated"));
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    }
  }

  async function removeOrArchive(branch) {
    const hasOrders = Number(branch.orderCount || 0) > 0;
    let staff = [];
    try {
      const all = await fetchPharmacists();
      staff = (Array.isArray(all) ? all : all?.items || []).filter((row) => row.branchId === branch.id);
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
      return;
    }
    if (staff.length) {
      const names = staff.map((row) => row.name || row.phone).join(", ");
      await confirm({
        title: hasOrders ? t("admin.archive") : t("admin.deleteBranch"),
        body: t(
          "admin.branchHasStaff",
          `Filialda farmatsevtlar bor: ${names}. Avval ularni boshqa filialga o'tkazing yoki amalni bekor qiling.`,
          { names }
        ),
        confirmLabel: t("admin.close", "Yopish"),
        danger: false,
      });
      return;
    }
    const ok = await confirm({
      title: hasOrders ? t("admin.archive") : t("admin.deleteBranch"),
      body: hasOrders ? t("admin.archiveHint", { count: branch.orderCount }) : t("admin.deleteBranchHint"),
      confirmLabel: hasOrders ? t("admin.archive") : t("admin.deleteBranch"),
      danger: true,
    });
    if (!ok) return;
    setError("");
    try {
      if (hasOrders) await archiveAdminBranch(branch.id);
      else await deleteAdminBranch(branch.id);
      await load();
      push(hasOrders ? t("admin.archived") : t("admin.deletedBranch"));
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    }
  }

  async function restore(branch) {
    const ok = await confirm({
      title: t("admin.unarchive"),
      body: t("admin.unarchiveHint"),
      confirmLabel: t("admin.unarchive"),
    });
    if (!ok) return;
    try {
      await unarchiveAdminBranch(branch.id);
      await load();
      push(t("admin.unarchived"));
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    }
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Filiallar</h2>
          <p className="text-sm text-slate-500">{closedOnly ? t("admin.dash.closedBranchesHint") : t("admin.branchHint")}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white hover:bg-[#066341]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Yangi filial qo'shish
        </button>
      </div>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      <div className="mt-4">
        {loading ? (
          <AdminSkeleton />
        ) : loadError ? (
          <ErrorState
            title={loadError}
            onRetry={() => {
              setLoading(true);
              load()
                .catch((err) => setLoadError(errorText(err, t("admin.errorTitle"))))
                .finally(() => setLoading(false));
            }}
          />
        ) : (
          <>
          <div className="mb-3">
            <select aria-label={t("admin.colStatus")} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
              <option value="current">{t("admin.branchFilterCurrent")}</option>
              <option value="active">{t("admin.active")}</option>
              <option value="inactive">{t("admin.inactive")}</option>
              <option value="archived">{t("admin.archivedStatus")}</option>
              <option value="all">{t("admin.allStatuses")}</option>
            </select>
          </div>
          <DataTable
            rows={branches.filter((row) => {
              if (closedOnly && row.isOpen !== false) return false;
              if (statusFilter === "current") return row.status !== "archived";
              if (statusFilter === "all") return true;
              return row.status === statusFilter;
            })}
            rowKey={(row) => row.id}
            searchText={(row) => [row.name, row.slug, row.address, row.phone, row.district].filter(Boolean).join(" ")}
            emptyTitle={t("admin.emptyTitle")}
            emptyBody={t("admin.branchesEmpty")}
            columns={[
              {
                key: "name",
                header: t("admin.colName"),
                render: (row) => (
                  <span>
                    <span className="block font-semibold text-slate-900">{row.name}</span>
                    <span className="block text-xs text-slate-500">{row.slug}</span>
                  </span>
                ),
              },
              { key: "pharmacistCount", header: t("admin.pharmacists"), sortValue: (row) => row.pharmacistCount || 0 },
              { key: "todayOrders", header: t("admin.todayOrders"), sortValue: (row) => row.todayOrders || 0 },
              { key: "todayRevenue", header: t("admin.todayRevenue"), sortValue: (row) => row.todayRevenue || 0, render: (row) => formatSom(row.todayRevenue || 0) },
              {
                key: "status",
                header: t("admin.colStatus"),
                sortValue: (row) => row.status || "",
                render: (row) => (
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.status === "active" ? "bg-emerald-50 text-emerald-700" : row.status === "archived" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-800"}`}>
                    {t(`admin.branchStatus.${row.status}`, row.status)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: t("admin.colActions"),
                sortable: false,
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => openEdit(row)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700">
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {t("admin.edit")}
                    </button>
                    {row.status === "archived" ? (
                      <button type="button" onClick={() => restore(row)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700">{t("admin.unarchive")}</button>
                    ) : (
                      <button type="button" onClick={() => toggle(row)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700">
                        {row.isActive ? t("admin.deactivate") : t("admin.activate")}
                      </button>
                    )}
                    {row.status !== "archived" && (
                      <button type="button" onClick={() => removeOrArchive(row)} className="h-10 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-600">
                        {Number(row.orderCount || 0) > 0 ? t("admin.archive") : t("admin.deleteBranch")}
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
          </>
        )}
      </div>

      {draft && (
        <Modal wide title={editingId ? t("admin.editBranch") : t("admin.newBranch")} onClose={() => setDraft(null)}>
          <form noValidate onSubmit={save} className="grid gap-3">
            <Field label={t("admin.colName")} error={fieldErrors.name}>
              <input className={controlClass(fieldErrors.name)} value={draft.name} onChange={(event) => {
                const name = event.target.value;
                setDraft({ ...draft, name, slug: draft.slugTouched ? draft.slug : slugify(name) });
                setFieldErrors((current) => ({ ...current, name: "" }));
              }} aria-invalid={Boolean(fieldErrors.name)} />
            </Field>
            <Field label="Slug" error={fieldErrors.slug}>
              <input className={controlClass(fieldErrors.slug)} value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value, slugTouched: true })} />
            </Field>
            <Field label="Manzil" error={fieldErrors.address}>
              <input className={controlClass(fieldErrors.address)} value={draft.address} onChange={(event) => { setDraft({ ...draft, address: event.target.value }); setFieldErrors((current) => ({ ...current, address: "" })); }} aria-invalid={Boolean(fieldErrors.address)} />
            </Field>
            <Field label={t("admin.colPhone")} error={fieldErrors.phone}>
              <input className={controlClass(fieldErrors.phone)} value={draft.phone} placeholder="+998901234567" onChange={(event) => { setDraft({ ...draft, phone: event.target.value }); setFieldErrors((current) => ({ ...current, phone: "" })); }} aria-invalid={Boolean(fieldErrors.phone)} />
            </Field>
            <Field label={t("admin.district")}>
              <input className={controlClass()} value={draft.district} onChange={(event) => setDraft({ ...draft, district: event.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft({ ...draft, allDay: event.target.checked })} />
              24/7
            </label>
            {!draft.allDay && (
              <div className="grid gap-2">
                {WEEK.map((key) => (
                  <div key={key} className="grid grid-cols-[5.5rem_1fr_1fr_auto] items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">{t(`admin.days.${key}`)}</span>
                    <input type="time" disabled={draft[key].closed} value={draft[key].open} onChange={(event) => setDraft({ ...draft, [key]: { ...draft[key], open: event.target.value } })} className={controlClass()} />
                    <input type="time" disabled={draft[key].closed} value={draft[key].close} onChange={(event) => setDraft({ ...draft, [key]: { ...draft[key], close: event.target.value } })} className={controlClass()} />
                    <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                      <input type="checkbox" checked={draft[key].closed} onChange={(event) => setDraft({ ...draft, [key]: { ...draft[key], closed: event.target.checked } })} />
                      {t("admin.dayClosed")}
                    </label>
                  </div>
                ))}
              </div>
            )}
            <Field label={t("admin.mapPoint")}>
              <BranchMap lat={draft.lat} lng={draft.lng} onPick={({ lat, lng }) => setDraft({ ...draft, lat, lng })} />
              <span className="text-xs text-slate-500">{draft.lat != null && draft.lng != null ? `${draft.lat}, ${draft.lng}` : t("admin.mapHint")}</span>
            </Field>
            <Field label={t("admin.radius")}>
              <input className={controlClass()} inputMode="numeric" value={draft.deliveryRadiusKm} onChange={(event) => setDraft({ ...draft, deliveryRadiusKm: event.target.value.replace(/\D/g, "").slice(0, 2) })} />
            </Field>
            <Field label={t("admin.lekkoKey")}>
              {editingId && keyMeta.hasLekkoKey && !replacingKey ? (
                <div className="grid gap-2">
                  <p className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-700">
                    {keyMeta.lekkoKeyLast4 ? t("admin.lekkoMasked", { last4: keyMeta.lekkoKeyLast4 }) : "••••"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReplacingKey(true);
                        setDraft({ ...draft, lekkoApiKey: "" });
                      }}
                      className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"
                    >
                      {t("admin.lekkoReplace")}
                    </button>
                    <button
                      type="button"
                      onClick={removeKey}
                      disabled={busy}
                      className="h-10 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-600 disabled:opacity-50"
                    >
                      {t("admin.lekkoDelete")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <input
                    className={controlClass()}
                    value={draft.lekkoApiKey}
                    onChange={(event) => setDraft({ ...draft, lekkoApiKey: event.target.value })}
                    placeholder={editingId ? t("admin.lekkoNew") : ""}
                    autoComplete="off"
                  />
                  {editingId && (
                    <p className="text-xs text-slate-500">{t("admin.lekkoReplaceHint")}</p>
                  )}
                  {editingId && replacingKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setReplacingKey(false);
                        setDraft({ ...draft, lekkoApiKey: "" });
                      }}
                      className="h-10 justify-self-start rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"
                    >
                      {t("admin.lekkoCancel")}
                    </button>
                  )}
                </div>
              )}
            </Field>
            <Field label="LEKKO dorixona ID">
              <input
                className={controlClass()}
                inputMode="numeric"
                value={draft.lekkoDrugStoreId}
                onChange={(event) => setDraft({ ...draft, lekkoDrugStoreId: event.target.value.replace(/\D/g, "") })}
              />
            </Field>
            <LoadingButton
              type="submit"
              loading={busy}
              loadingText="Saqlanmoqda..."
              className="h-11 rounded-xl bg-[#087B51] text-sm font-bold text-white hover:bg-[#066341] disabled:opacity-50"
            >
              Saqlash
            </LoadingButton>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function PharmacistManager({ onSaved } = {}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const push = useToastStore((state) => state.push);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [roleFilter, setRoleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");

  async function load() {
    setLoadError("");
    const [staff, branchList] = await Promise.all([fetchPharmacists(), fetchAdminBranches()]);
    setRows(staff || []);
    setBranches(branchList || []);
  }

  useEffect(() => {
    load()
      .catch((err) => setLoadError(errorText(err, t("admin.errorTitle"))))
      .finally(() => setLoading(false));
  }, [t]);

  function openCreate() {
    setEditingId("");
    setDraft({ ...emptyPharmacist });
    setError("");
  }

  function openEdit(row) {
    setEditingId(row.id);
    setDraft({
      fullName: row.fullName || row.name || "",
      phone: row.phone || "",
      password: "",
      branchId: row.branchId || "",
      role: row.role || "BRANCH_ADMIN",
    });
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!draft.fullName.trim()) nextErrors.fullName = t("admin.validation.required");
    if (!/^\+998\d{9}$/.test(draft.phone.trim())) nextErrors.phone = t("admin.phoneFormat");
    if ((!editingId && !staffPasswordOk(draft.password)) || (editingId && draft.password.trim() && !staffPasswordOk(draft.password))) {
      nextErrors.password = t("admin.validation.staffPassword");
    }
    if (draft.role !== "MANAGER" && !draft.branchId) nextErrors.branchId = t("admin.pickBranch");
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editingId) {
        const payload = {
          fullName: draft.fullName.trim(),
          phone: draft.phone.trim(),
          role: draft.role,
          branchId: draft.role === "MANAGER" ? null : draft.branchId,
        };
        if (draft.password.trim()) payload.password = draft.password;
        await updatePharmacist(editingId, payload);
        setNotice(t("admin.staffSaved"));
        push(t("admin.staffSaved"));
      } else {
        await createPharmacist({
          fullName: draft.fullName.trim(),
          phone: draft.phone.trim(),
          password: draft.password,
          role: draft.role,
          branchId: draft.role === "MANAGER" ? null : draft.branchId,
        });
        setNotice(t("admin.staffAdded"));
        push(t("admin.staffAdded"));
      }
      setDraft(null);
      await load();
      onSaved?.();
    } catch (err) {
      setError(errorText(err, "Saqlanmadi"));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(row) {
    const suspending = row.status !== "SUSPENDED";
    const ok = await confirm({
      title: suspending ? t("admin.suspend") : t("admin.activate"),
      body: suspending ? t("admin.suspendHint", { name: row.fullName || row.name }) : t("admin.activateStaffHint"),
      confirmLabel: suspending ? t("admin.suspend") : t("admin.activate"),
      danger: suspending,
    });
    if (!ok) return;
    setError("");
    try {
      await setPharmacistStatus(row.id, suspending ? "SUSPENDED" : "ACTIVE");
      await load();
      push(suspending ? t("admin.suspended") : t("admin.activated"));
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    }
  }

  async function remove(row) {
    const ok = await confirm({
      title: t("admin.softDelete"),
      body: t("admin.softDeleteHint", { name: row.fullName || row.name }),
      confirmLabel: t("admin.softDelete"),
      danger: true,
    });
    if (!ok) return;
    setError("");
    try {
      await deletePharmacist(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      push(t("admin.staffRemoved"));
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    }
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">{t("admin.nav.staff")}</h2>
          <p className="text-sm text-slate-500">{t("admin.staffHint")}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white hover:bg-[#066341]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("admin.newStaff")}
        </button>
      </div>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      <div className="mt-4">
        {loading ? (
          <AdminSkeleton />
        ) : loadError ? (
          <ErrorState
            title={loadError}
            onRetry={() => {
              setLoading(true);
              load()
                .catch((err) => setLoadError(errorText(err, t("admin.errorTitle"))))
                .finally(() => setLoading(false));
            }}
          />
        ) : (
          <>
          <div className="mb-3 flex flex-wrap gap-2">
            <select aria-label={t("admin.colRole")} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
              <option value="">{t("admin.allRoles")}</option>
              <option value="BRANCH_ADMIN">{t("admin.role.BRANCH_ADMIN")}</option>
              <option value="MANAGER">{t("admin.role.MANAGER")}</option>
            </select>
            <select aria-label={t("admin.colBranch")} value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">
              <option value="">{t("admin.allBranches")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <DataTable
            rows={rows.filter((row) => (!roleFilter || row.role === roleFilter) && (!branchFilter || row.branchId === branchFilter))}
            rowKey={(row) => row.id}
            searchText={(row) => [row.fullName, row.name, row.phone, row.branchName, row.branch?.name, row.role].filter(Boolean).join(" ")}
            emptyTitle={t("admin.staffEmpty")}
            emptyBody={t("admin.staffEmptyBody")}
            columns={[
              { key: "name", header: t("admin.colName"), sortValue: (row) => row.fullName || row.name || "", render: (row) => <span className="font-semibold text-slate-900">{row.fullName || row.name}</span> },
              { key: "role", header: t("admin.colRole"), render: (row) => t(`admin.role.${row.role}`, row.role) },
              { key: "phone", header: t("admin.colPhone") },
              { key: "branch", header: t("admin.colBranch"), sortValue: (row) => row.branchName || row.branch?.name || "", render: (row) => row.branchName || row.branch?.name || "—" },
              { key: "lastLoginAt", header: t("admin.lastLogin"), sortValue: (row) => row.lastLoginAt || "", render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "—") },
              {
                key: "status",
                header: t("admin.colStatus"),
                sortValue: (row) => row.status || "",
                render: (row) => (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${row.status === "SUSPENDED" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                    {t(`admin.userStatus.${row.status}`, row.status)}
                  </span>
                ),
              },
              {
                key: "actions",
                header: t("admin.colActions"),
                sortable: false,
                render: (row) => (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => openEdit(row)} className="inline-flex h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700">
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {t("admin.edit")}
                    </button>
                    <button type="button" onClick={() => setStatus(row)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700">
                      {row.status === "SUSPENDED" ? t("admin.activate") : t("admin.suspend")}
                    </button>
                    <button type="button" onClick={() => remove(row)} className="h-10 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-600">
                      {t("admin.softDelete")}
                    </button>
                  </div>
                ),
              },
            ]}
          />
          </>
        )}
      </div>

      {draft && (
        <Modal title={editingId ? t("admin.editStaff") : t("admin.newStaff")} onClose={() => setDraft(null)}>
          <form noValidate onSubmit={save} className="grid gap-3">
            <Field label={t("admin.colName")} error={fieldErrors.fullName}>
              <input className={controlClass(fieldErrors.fullName)} value={draft.fullName} onChange={(event) => { setDraft({ ...draft, fullName: event.target.value }); setFieldErrors((current) => ({ ...current, fullName: "" })); }} aria-invalid={Boolean(fieldErrors.fullName)} />
            </Field>
            <Field label={t("admin.colRole")}>
              <select className={controlClass()} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value, branchId: event.target.value === "MANAGER" ? "" : draft.branchId })}>
                <option value="BRANCH_ADMIN">{t("admin.role.BRANCH_ADMIN")}</option>
                <option value="MANAGER">{t("admin.role.MANAGER")}</option>
              </select>
            </Field>
            <Field label={t("admin.colPhone")} error={fieldErrors.phone}>
              <input className={controlClass(fieldErrors.phone)} value={draft.phone} onChange={(event) => { setDraft({ ...draft, phone: event.target.value }); setFieldErrors((current) => ({ ...current, phone: "" })); }} aria-invalid={Boolean(fieldErrors.phone)} />
            </Field>
            <Field label={editingId ? t("admin.tempPasswordOptional") : t("admin.tempPassword")} error={fieldErrors.password}>
              <input
                type="password"
                className={controlClass(fieldErrors.password)}
                value={draft.password}
                onChange={(event) => { setDraft({ ...draft, password: event.target.value }); setFieldErrors((current) => ({ ...current, password: "" })); }}
                aria-invalid={Boolean(fieldErrors.password)}
              />
              <span className="text-xs text-slate-500">{t("admin.tempPasswordHint")}</span>
            </Field>
            {draft.role !== "MANAGER" && (
            <Field label={t("admin.colBranch")} error={fieldErrors.branchId}>
              <select
                className={controlClass(fieldErrors.branchId)}
                value={draft.branchId}
                onChange={(event) => { setDraft({ ...draft, branchId: event.target.value }); setFieldErrors((current) => ({ ...current, branchId: "" })); }}
                aria-invalid={Boolean(fieldErrors.branchId)}
              >
                <option value="">{t("admin.pickBranch")}</option>
                {branches.filter((branch) => branch.status === "active" || (branch.isActive && !branch.archivedAt)).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </Field>
            )}
            <LoadingButton
              type="submit"
              loading={busy}
              loadingText="Saqlanmoqda..."
              className="h-11 rounded-xl bg-[#087B51] text-sm font-bold text-white hover:bg-[#066341] disabled:opacity-50"
            >
              Saqlash
            </LoadingButton>
          </form>
        </Modal>
      )}
    </section>
  );
}
