import { useTranslation } from "react-i18next";
import { MapPin, XCircle } from "lucide-react";
import MapCheckoutSection from "../checkout/MapCheckoutSection";

export default function AddressModal({ open, title, form, saving, onChange, onClose, onSubmit }) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 md:items-center md:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-100 bg-white p-5 shadow-sm md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("address.title")}</p>
            <h2 id="address-modal-title" className="mt-1 text-lg font-extrabold text-slate-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-slate-50"
            aria-label={t("common.close")}
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-4">
          <MapCheckoutSection
            street={form.street}
            apartment={form.apartment}
            floor={form.floor}
            intercom={form.intercom}
            entrance={form.entrance || ""}
            landmark={form.landmark || ""}
            lat={form.lat}
            lng={form.lng}
            onChange={(patch) => onChange({ ...form, ...patch })}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || !form.street.trim()}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50 sm:flex-none"
            >
              <MapPin className="h-4 w-4" />
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:flex-none"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
