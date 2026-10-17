import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  bulkUpdateBranchStock,
  fetchBranchStock,
  fetchStockMovements,
  syncLekkoStock,
  uploadMedicineImage,
} from "../../services/api";
import StockRow from "./StockRow";
import { apiError, stockInputError } from "./panelShared";

export default function StockTab({ branch, branchId, focus, readOnly = false, onToast, onBranch }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [searching, setSearching] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [history, setHistory] = useState({});
  const [uploadingId, setUploadingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [lekkoBusy, setLekkoBusy] = useState(false);
  const [lekkoNote, setLekkoNote] = useState("");
  const [tallies, setTallies] = useState({ low: 0, out: 0, rx: 0 });
  const [uploadError, setUploadError] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (String(focus || "").startsWith("low")) setFilter("low");
  }, [focus]);

  useEffect(() => {
    if (!branchId) return undefined;
    let active = true;
    setSearching(true);
    fetchBranchStock(branchId, { search: query, filter, page: 1, limit: 20 })
      .then((data) => {
        if (!active) return;
        setRows(data.stocks);
        setHasMore(data.hasMore);
        setPage(1);
        setTallies({ low: data.lowStockCount || 0, out: data.outCount || 0, rx: data.rxCount || 0 });
        if (data.branch) onBranch?.(data.branch);
      })
      .catch((error) => onToast(apiError(error, t("panel.loadFailed", "Ro'yxat yuklanmadi"))))
      .finally(() => active && setSearching(false));
    return () => {
      active = false;
    };
  }, [branchId, query, filter]);

  function onDraft(row, next) {
    if (String(next.stockCount) === String(row.stockCount) && !next.reason) {
      setDrafts((current) => {
        const copy = { ...current };
        delete copy[row.id];
        return copy;
      });
      return;
    }
    setDrafts((current) => ({ ...current, [row.id]: next }));
  }

  async function saveAll() {
    const items = Object.entries(drafts).map(([id, draft]) => ({ id, ...draft, row: rows.find((item) => item.id === id) }));
    for (const item of items) {
      const error = stockInputError(item.stockCount);
      if (error) {
        onToast(error);
        return;
      }
      if (!item.reason) {
        onToast(t("panel.needReason", "Qoldiq sababini tanlang"));
        return;
      }
    }
    if (!items.length) return;
    setSaving(true);
    try {
      await bulkUpdateBranchStock(items.map((item) => ({
        id: item.id,
        stockCount: Number(item.stockCount),
        reason: item.reason,
      })));
      setDrafts({});
      const data = await fetchBranchStock(branchId, { search: query, filter, page: 1, limit: 20 });
      setRows(data.stocks);
      onToast(t("panel.saved", "Saqlandi"));
    } catch (error) {
      onToast(apiError(error, t("panel.actionFailed", "Amal bajarilmadi")));
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(row) {
    if (history[row.id]) {
      setHistory((current) => ({ ...current, [row.id]: undefined }));
      return;
    }
    const rowsHistory = await fetchStockMovements(row.id);
    setHistory((current) => ({ ...current, [row.id]: rowsHistory || [] }));
  }

  async function upload(row, file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onToast(t("panel.badImage", "Faqat JPEG, PNG yoki WEBP rasm yuklash mumkin"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onToast(t("panel.bigImage", "Rasm hajmi 2MB dan oshmasligi kerak"));
      return;
    }
    setUploadingId(row.id);
    setUploadError((current) => ({ ...current, [row.id]: "" }));
    try {
      const updated = await uploadMedicineImage(row.medicineId, file);
      setRows((current) => current.map((item) => (item.id === row.id ? { ...item, imageUrl: updated.imageUrl } : item)));
      onToast(t("panel.imageSaved", "Rasm saqlandi"));
    } catch (error) {
      const message = apiError(error, t("panel.badImage", "Faqat JPEG, PNG yoki WEBP rasm yuklash mumkin"));
      setUploadError((current) => ({ ...current, [row.id]: message }));
      onToast(message);
    } finally {
      setUploadingId("");
    }
  }

  async function sync() {
    setLekkoBusy(true);
    setLekkoNote("");
    try {
      const result = await syncLekkoStock(branchId, { fullSync: false });
      setLekkoNote(result.message || t("panel.synced", "Yangilandi"));
      if (result.branch) onBranch?.(result.branch);
      const data = await fetchBranchStock(branchId, { search: query, filter, page: 1, limit: 20 });
      setRows(data.stocks);
      onToast(result.message || t("panel.synced", "Yangilandi"));
    } catch (error) {
      const message = apiError(error, t("panel.syncFailed", "Sinxron amalga oshmadi"));
      setLekkoNote(message);
      onToast(message);
    } finally {
      setLekkoBusy(false);
    }
  }

  async function onSearchKey(event) {
    if (event.key !== "Enter") return;
    const code = search.trim();
    if (!/^\d{6,}$/.test(code)) return;
    event.preventDefault();
    const data = await fetchBranchStock(branchId, { barcode: code, page: 1, limit: 5 });
    if (data.stocks[0]) {
      setRows(data.stocks);
      setHasMore(false);
      onToast(data.stocks[0].name);
    } else {
      onToast(t("panel.notFound", "Mahsulot topilmadi"));
    }
  }

  const synced = branch?.lastSyncedAt ? new Date(branch.lastSyncedAt).toLocaleString() : t("panel.neverSynced", "hali yo'q");
  const errorCount = Object.values(drafts).filter((draft) => stockInputError(draft.stockCount) || !draft.reason).length;

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={onSearchKey}
          placeholder={t("panel.stockSearch", "Dori yoki shtrix-kod")}
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
        />
        {searching && <span className="text-xs text-slate-500">{t("panel.loading", "Yuklanmoqda...")}</span>}
        {!readOnly && (
          <button type="button" disabled={saving || !Object.keys(drafts).length || errorCount > 0} onClick={saveAll} className="h-11 rounded-xl bg-brand px-3 text-sm font-bold text-white disabled:opacity-50">
            {errorCount > 0 ? `${errorCount} ta xato` : t("panel.saveAll", "Hammasini saqlash")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["", t("panel.filters.all", "Barchasi")],
          ["low", `Kam qolganlar (${tallies.low})`],
          ["out", `Tugaganlar (${tallies.out})`],
          ["rx", `Retseptli (${tallies.rx})`],
        ].map(([id, label]) => (
          <button key={id || "all"} type="button" onClick={() => setFilter(id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === id ? "bg-slate-900 text-white" : "bg-white"}`}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" disabled={lekkoBusy || !branch?.hasLekkoKey} onClick={sync} className="h-10 rounded-xl border px-3 font-semibold disabled:opacity-50">
          {lekkoBusy ? t("panel.syncing", "Sinxronlanmoqda...") : t("panel.sync", "LEKKO sinxron")}
        </button>
        <span>{t("panel.lastSync", "Oxirgi sinxron")}: {synced}</span>
        {!branch?.hasLekkoKey && <span className="text-amber-800">{t("panel.syncMissing", "API kaliti biriktirilmagan")}</span>}
        {lekkoNote && <span>{lekkoNote}</span>}
      </div>
      <div className={`hidden gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 lg:grid ${readOnly ? "grid-cols-[72px_1.4fr_120px_auto]" : "grid-cols-[72px_1.4fr_120px_140px_160px_auto]"}`}>
        <span>{t("panel.image", "Rasm")}</span>
        <span>{t("panel.product", "Mahsulot")}</span>
        <span>{t("panel.stockCount", "Qoldiq")}</span>
        {!readOnly && <span>{t("panel.stockReason", "Sabab")}</span>}
        {!readOnly && <span>{t("panel.image", "Rasm")}</span>}
        <span>{t("panel.movements", "Harakatlar")}</span>
      </div>
      {!searching && rows.length === 0 && (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-slate-500">Mahsulot topilmadi</p>
          <button type="button" onClick={() => { setSearch(""); setQuery(""); setFilter(""); }} className="h-10 rounded-xl border px-3 text-sm font-semibold">Filtrlarni tozalash</button>
        </div>
      )}
      <div className="grid gap-2">
        {rows.map((row) => (
          <StockRow
            key={row.id}
            row={row}
            draft={drafts[row.id]}
            onDraft={onDraft}
            history={history[row.id]}
            onHistory={openHistory}
            uploading={uploadingId === row.id}
            uploadError={uploadError[row.id]}
            onUpload={upload}
            readOnly={readOnly}
          />
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={async () => {
            const data = await fetchBranchStock(branchId, { search: query, filter, page: page + 1, limit: 20 });
            setRows((current) => [...current, ...data.stocks]);
            setPage((value) => value + 1);
            setHasMore(data.hasMore);
          }}
          className="h-11 rounded-xl border text-sm font-bold"
        >
          {t("panel.loadMore", "Yana yuklash")}
        </button>
      )}
    </section>
  );
}
