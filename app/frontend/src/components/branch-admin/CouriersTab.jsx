import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createBranchCourier, fetchBranchCouriers, updateBranchCourier } from "../../services/api";
import { formatSom } from "../../lib/format";
import { LoadingButton } from "../ui";
import { apiError } from "./panelShared";

export default function CouriersTab({ onToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "+998", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function load() {
    return fetchBranchCouriers()
      .then(setRows)
      .catch((err) => setError(apiError(err, t("courier.loadFailed"))));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createBranchCourier(form);
      setForm({ name: "", phone: "+998", password: "" });
      await load();
      onToast?.(t("courier.panel.saved"));
    } catch (err) {
      setError(apiError(err, t("courier.loadFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row) {
    setBusy(true);
    try {
      await updateBranchCourier(row.id, { status: row.active ? "SUSPENDED" : "ACTIVE" });
      await load();
    } catch (err) {
      onToast?.(apiError(err, t("courier.loadFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-4">
      <form onSubmit={add} className="grid gap-2 rounded-2xl bg-white p-4 md:grid-cols-4">
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t("courier.panel.name")} className="h-12 rounded-xl border border-slate-200 px-3" required />
        <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={t("courier.panel.phone")} className="h-12 rounded-xl border border-slate-200 px-3" required />
        <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={t("courier.panel.password")} className="h-12 rounded-xl border border-slate-200 px-3" required />
        <LoadingButton type="submit" loading={busy} className="h-12 rounded-xl bg-brand font-bold text-white disabled:opacity-50">{t("courier.panel.add")}</LoadingButton>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows.length && <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">{t("courier.panel.courierEmpty")}</p>}
      <div className="grid gap-2">
        {rows.map((row) => (
          <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4">
            <div>
              <p className="font-extrabold">{row.name}</p>
              <p className="text-sm text-slate-600">{row.phone}</p>
              <p className="text-sm text-slate-500">{t("courier.panel.today")}: {row.todayDelivered} · {formatSom(row.todayCash || 0)}</p>
            </div>
            <button type="button" disabled={busy} onClick={() => toggle(row)} className={`h-11 rounded-xl px-4 text-sm font-bold ${row.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
              {row.active ? t("courier.panel.active") : t("courier.panel.inactive")}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
