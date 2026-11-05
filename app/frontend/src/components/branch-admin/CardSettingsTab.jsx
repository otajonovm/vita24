import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchBranchCardSettings, saveBranchCardSettings } from "../../services/api";
import { ErrorState, LoadingButton } from "../ui";
import { apiError } from "./panelShared";

function formatCardInput(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();
}

function isMasked(value) {
  return String(value || "").includes("*");
}

export default function CardSettingsTab({ onToast, readOnly = false }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchBranchCardSettings();
      setForm({
        cardTransferEnabled: Boolean(data.cardTransferEnabled),
        cardTransferNumber: data.cardTransferNumber
          ? formatCardInput(data.cardTransferNumber)
          : data.cardTransferNumberMasked || "",
        cardTransferHolder: data.cardTransferHolder || "",
        cardTransferBank: data.cardTransferBank || "",
      });
      setFieldErrors({});
    } catch (err) {
      setError(apiError(err, t("panel.loadFailed", "Ro'yxat yuklanmadi")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  }

  async function save(event) {
    event.preventDefault();
    if (readOnly || !form) return;
    const digits = String(form.cardTransferNumber || "").replace(/\D/g, "");
    const masked = isMasked(form.cardTransferNumber);
    const nextErrors = {};
    if (form.cardTransferEnabled) {
      if (!masked && digits.length !== 16) {
        nextErrors.cardTransferNumber = t("panel.card.numberInvalid");
      }
      if (!String(form.cardTransferHolder || "").trim()) {
        nextErrors.cardTransferHolder = t("panel.card.holderRequired");
      }
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const saved = await saveBranchCardSettings({
        cardTransferEnabled: form.cardTransferEnabled,
        cardTransferNumber: masked ? form.cardTransferNumber : digits,
        cardTransferHolder: form.cardTransferHolder.trim(),
        cardTransferBank: form.cardTransferBank.trim(),
      });
      setForm({
        cardTransferEnabled: Boolean(saved.cardTransferEnabled),
        cardTransferNumber: saved.cardTransferNumber
          ? formatCardInput(saved.cardTransferNumber)
          : saved.cardTransferNumberMasked || "",
        cardTransferHolder: saved.cardTransferHolder || "",
        cardTransferBank: saved.cardTransferBank || "",
      });
      onToast?.(t("panel.card.saved"));
    } catch (err) {
      onToast?.(apiError(err, t("panel.actionFailed", "Amal bajarilmadi")), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">{t("common.loading")}</p>;
  }
  if (error) {
    return <ErrorState title={error} onRetry={load} retryLabel={t("common.retry", "Qayta urinish")} />;
  }
  if (!form) return null;

  return (
    <section className="grid max-w-xl gap-4 rounded-2xl border border-slate-100 bg-white p-4">
      <div>
        <h2 className="text-lg font-extrabold text-slate-900">{t("panel.card.title")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("panel.card.hint")}</p>
      </div>
      <form onSubmit={save} className="grid gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={form.cardTransferEnabled}
            disabled={readOnly}
            onChange={(event) => setField("cardTransferEnabled", event.target.checked)}
          />
          {t("panel.card.enable")}
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-slate-700">{t("panel.card.number")}</span>
          <input
            className="h-11 rounded-xl border border-slate-200 px-3"
            inputMode="numeric"
            disabled={readOnly}
            value={form.cardTransferNumber}
            placeholder="8600 1234 5678 9012"
            onChange={(event) => {
              const raw = event.target.value;
              setField("cardTransferNumber", isMasked(raw) ? raw : formatCardInput(raw));
            }}
            onFocus={() => {
              if (isMasked(form.cardTransferNumber)) setField("cardTransferNumber", "");
            }}
          />
          {fieldErrors.cardTransferNumber ? (
            <span className="text-xs text-red-600">{fieldErrors.cardTransferNumber}</span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-slate-700">{t("panel.card.holder")}</span>
          <input
            className="h-11 rounded-xl border border-slate-200 px-3"
            disabled={readOnly}
            value={form.cardTransferHolder}
            onChange={(event) => setField("cardTransferHolder", event.target.value)}
          />
          {fieldErrors.cardTransferHolder ? (
            <span className="text-xs text-red-600">{fieldErrors.cardTransferHolder}</span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-slate-700">{t("panel.card.bank")}</span>
          <input
            className="h-11 rounded-xl border border-slate-200 px-3"
            disabled={readOnly}
            value={form.cardTransferBank}
            placeholder="Uzcard / Humo"
            onChange={(event) => setField("cardTransferBank", event.target.value)}
          />
        </label>
        {!readOnly && (
          <LoadingButton
            type="submit"
            loading={saving}
            loadingText={t("common.saving")}
            className="h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {t("common.save")}
          </LoadingButton>
        )}
      </form>
    </section>
  );
}
