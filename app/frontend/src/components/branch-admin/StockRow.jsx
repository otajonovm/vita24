import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatSom } from "../../lib/format";
import { resolveMediaUrl } from "../../lib/media";
import { STOCK_REASONS, stockInputError } from "./panelShared";

const STOCK_LABELS = Object.fromEntries(STOCK_REASONS);

export default function StockRow({ row, draft, onDraft, onHistory, history, uploading, uploadError, onUpload, readOnly = false }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const value = draft?.stockCount ?? String(row.stockCount);
  const error = draft ? stockInputError(value) : "";
  const reasonMissing = Boolean(draft) && !draft.reason;
  const barcode = row.barcode ? row.barcode : "—";

  return (
    <div className={`grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 lg:items-center ${readOnly ? "lg:grid-cols-[72px_1.4fr_120px_auto]" : "lg:grid-cols-[72px_1.4fr_120px_160px_140px_auto]"}`}>
      <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100">
        {row.imageUrl ? <img src={resolveMediaUrl(row.imageUrl)} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div>
        <p className="font-bold text-slate-900">{row.name}</p>
        <p className="text-xs text-slate-500">{[row.dosageForm, formatSom(row.price), barcode].filter(Boolean).join(" · ")}</p>
        {row.lowStock && <p className="text-xs font-semibold text-amber-700">{t("panel.lowStock", "Kam qoldiq")}</p>}
      </div>
      {readOnly ? (
        <p className="text-sm font-bold tabular-nums">{row.stockCount}</p>
      ) : (
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-slate-500 lg:sr-only">{t("panel.stockCount", "Qoldiq")}</span>
          <input
            value={value}
            onChange={(event) => onDraft(row, { stockCount: event.target.value, reason: draft?.reason || "" })}
            className={`h-10 rounded-xl border px-2 text-sm ${error ? "border-red-500" : "border-slate-200"}`}
          />
          {error && <span className="text-red-600">{error}</span>}
        </label>
      )}
      {!readOnly && (
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-slate-500 lg:sr-only">{t("panel.stockReason", "Sabab")}</span>
          <select
            value={draft?.reason || ""}
            onChange={(event) => onDraft(row, { stockCount: value, reason: event.target.value })}
            className={`h-10 rounded-xl border px-2 text-sm ${reasonMissing ? "border-red-500" : "border-slate-200"}`}
          >
            <option value="">{t("panel.pick", "Tanlang")}</option>
            {STOCK_REASONS.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          {reasonMissing && <span className="text-red-600">Sabab tanlang</span>}
        </label>
      )}
      {!readOnly && (
        <div className="grid gap-1">
          <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-brand disabled:opacity-50">
            {uploading ? "Yuklanmoqda..." : "Rasm yuklash"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(row, file);
            }}
          />
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>
      )}
      <button type="button" onClick={() => onHistory(row)} className="h-10 text-left text-sm font-semibold text-slate-600">
        {t("panel.movements", "Harakatlar")}
      </button>
      {history && (
        <ul className="col-span-full grid gap-1 text-xs text-slate-600">
          {history.length === 0 && <li>{t("panel.noMovements", "Harakat yo'q")}</li>}
          {history.map((item) => {
            const delta = Number(item.delta);
            const sign = delta > 0 ? `+${delta}` : String(delta).replace("-", "−");
            return (
              <li key={item.id}>
                {formatDateTime(item.createdAt)} · {item.beforeCount ?? "—"} → {item.afterCount ?? "—"} · {sign} · {STOCK_LABELS[item.reason] || item.reason} · {item.userName || "—"}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
