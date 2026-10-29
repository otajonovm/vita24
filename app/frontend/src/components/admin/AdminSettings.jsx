import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchShopSettings, saveShopSettings } from "../../services/api";
import { useToastStore } from "../../store/useToastStore";
import AdminSecurity from "./AdminSecurity";
import { AdminSkeleton, ErrorState, Field, controlClass } from "./ui";

const TEMPLATE_KEYS = ["otp", "askContact", "PAID", "PREPARING", "READY", "DELIVERING", "COMPLETED", "CANCELLED", "WAITING_PAYMENT"];

function errorText(error, fallback) {
  return error.response?.data?.error?.message || error.message || fallback;
}

function formFrom(data) {
  return {
    deliveryFee: String(data.deliveryFee ?? 15000),
    freeDeliveryFrom: String(data.freeDeliveryFrom ?? 200000),
    reviewWindowMinutes: String(data.reviewWindowMinutes ?? 120),
    paymentWindowMinutes: String(data.paymentWindowMinutes ?? 15),
    paymeEnabled: data.paymeEnabled !== false,
    clickEnabled: data.clickEnabled !== false,
    cashEnabled: data.cashEnabled !== false,
    cardTerminalEnabled: data.cardTerminalEnabled !== false,
    pickupEnabled: data.pickupEnabled !== false,
    telegramBotToken: "",
    contactPhone: data.contactPhone || "",
    contactPhoneAlt: data.contactPhoneAlt || "",
    footerAbout: data.footerAbout || "",
    footerLicensed: data.footerLicensed || "",
    footerShort: data.footerShort || "",
    messageTemplates: Object.fromEntries(TEMPLATE_KEYS.map((key) => [key, data.messageTemplates?.[key] || ""])),
  };
}

export function SettingsPanel() {
  const { t } = useTranslation();
  const push = useToastStore((state) => state.push);
  const [form, setForm] = useState(null);
  const [mask, setMask] = useState("");
  const [fromEnv, setFromEnv] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchShopSettings();
      setForm(formFrom(data));
      setMask(data.telegramTokenLast4 || "");
      setFromEnv(Boolean(data.telegramFromEnv));
    } catch (err) {
      setError(errorText(err, t("admin.errorTitle")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, [t]);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    const payload = {
      deliveryFee: Number(form.deliveryFee),
      freeDeliveryFrom: Number(form.freeDeliveryFrom),
      reviewWindowMinutes: Number(form.reviewWindowMinutes),
      paymentWindowMinutes: Number(form.paymentWindowMinutes),
      paymeEnabled: form.paymeEnabled,
      clickEnabled: form.clickEnabled,
      cashEnabled: form.cashEnabled,
      cardTerminalEnabled: form.cardTerminalEnabled,
      pickupEnabled: form.pickupEnabled,
      contactPhone: form.contactPhone.trim(),
      contactPhoneAlt: form.contactPhoneAlt.trim(),
      footerAbout: form.footerAbout.trim(),
      footerLicensed: form.footerLicensed.trim(),
      footerShort: form.footerShort.trim(),
      messageTemplates: form.messageTemplates,
      ...(form.telegramBotToken.trim() ? { telegramBotToken: form.telegramBotToken.trim() } : {}),
    };
    setSaving(true);
    try {
      const saved = await saveShopSettings(payload);
      setForm(formFrom(saved));
      setMask(saved.telegramTokenLast4 || "");
      setFromEnv(Boolean(saved.telegramFromEnv));
      push(t("admin.settingsSaved"));
    } catch (err) {
      push(errorText(err, t("admin.errorTitle")), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">{t("admin.nav.settings")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.settingsHint")}</p>
      </div>
      {error ? <ErrorState title={error} onRetry={load} /> : loading || !form ? <AdminSkeleton /> : (
        <form onSubmit={save} className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("admin.settingsDelivery")}><input className={controlClass()} inputMode="decimal" value={form.deliveryFee} onChange={(event) => setField("deliveryFee", event.target.value)} /></Field>
            <Field label={t("admin.settingsFreeFrom")}><input className={controlClass()} inputMode="decimal" value={form.freeDeliveryFrom} onChange={(event) => setField("freeDeliveryFrom", event.target.value)} /></Field>
            <Field label={t("admin.settingsReview")}><input className={controlClass()} inputMode="numeric" value={form.reviewWindowMinutes} onChange={(event) => setField("reviewWindowMinutes", event.target.value)} /></Field>
            <Field label={t("admin.settingsPaymentWindow")}><input className={controlClass()} inputMode="numeric" value={form.paymentWindowMinutes} onChange={(event) => setField("paymentWindowMinutes", event.target.value)} /></Field>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Check label="Payme" checked={form.paymeEnabled} onChange={(value) => setField("paymeEnabled", value)} />
            <Check label="Click" checked={form.clickEnabled} onChange={(value) => setField("clickEnabled", value)} />
            <Check label={t("admin.settingsCash")} checked={form.cashEnabled} onChange={(value) => setField("cashEnabled", value)} />
            <Check label={t("courier.settings.cardTerminal")} checked={form.cardTerminalEnabled} onChange={(value) => setField("cardTerminalEnabled", value)} />
            <Check label={t("admin.settingsPickup")} checked={form.pickupEnabled} onChange={(value) => setField("pickupEnabled", value)} />
          </div>
          <Field label={t("admin.settingsTelegram")}>
            <input className={controlClass()} type="password" autoComplete="new-password" value={form.telegramBotToken} onChange={(event) => setField("telegramBotToken", event.target.value)} placeholder={mask ? t("admin.lekkoMasked", { last4: mask }) : t("admin.settingsTelegramEmpty")} />
            <span className="text-xs text-slate-500">{fromEnv ? t("admin.settingsTelegramEnv") : t("admin.settingsTelegramKeep")}</span>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("admin.settingsPhone")}><input className={controlClass()} value={form.contactPhone} onChange={(event) => setField("contactPhone", event.target.value)} /></Field>
            <Field label={t("admin.settingsPhoneAlt")}><input className={controlClass()} value={form.contactPhoneAlt} onChange={(event) => setField("contactPhoneAlt", event.target.value)} /></Field>
          </div>
          <Field label={t("admin.settingsAbout")}><textarea className={controlClass()} rows={2} value={form.footerAbout} onChange={(event) => setField("footerAbout", event.target.value)} /></Field>
          <Field label={t("admin.settingsLicensed")}><input className={controlClass()} value={form.footerLicensed} onChange={(event) => setField("footerLicensed", event.target.value)} /></Field>
          <Field label={t("admin.settingsShort")}><textarea className={controlClass()} rows={2} value={form.footerShort} onChange={(event) => setField("footerShort", event.target.value)} /></Field>
          <div className="grid gap-3">
            <p className="text-sm font-extrabold text-slate-900">{t("admin.settingsTemplates")}</p>
            {TEMPLATE_KEYS.map((key) => (
              <Field key={key} label={t(`admin.settingsTemplate.${key}`)}>
                <textarea className={controlClass()} rows={2} value={form.messageTemplates[key]} onChange={(event) => setForm((current) => ({ ...current, messageTemplates: { ...current.messageTemplates, [key]: event.target.value } }))} />
              </Field>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="h-10 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-60">{saving ? t("admin.saving") : t("common.save")}</button>
          </div>
        </form>
      )}
      <AdminSecurity />
    </section>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
