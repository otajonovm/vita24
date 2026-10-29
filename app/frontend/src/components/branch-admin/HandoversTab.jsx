import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { confirmHandover, disputeHandover, fetchHandovers } from "../../services/api";
import { formatSom } from "../../lib/format";
import { LoadingButton } from "../ui";
import { apiError } from "./panelShared";

export default function HandoversTab({ onToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  function load() {
    return fetchHandovers()
      .then(setRows)
      .catch((err) => setError(apiError(err, t("courier.loadFailed"))));
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id, kind) {
    setBusyId(id);
    setError("");
    try {
      if (kind === "confirm") await confirmHandover(id, note);
      else await disputeHandover(id, note);
      setNote("");
      await load();
      onToast?.(t("courier.panel.saved"));
    } catch (err) {
      setError(apiError(err, t("courier.loadFailed")));
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="grid gap-3">
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("courier.fail.note")} className="min-h-20 rounded-2xl border border-slate-200 p-3" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows.length && <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">{t("courier.panel.handoverEmpty")}</p>}
      {rows.map((row) => (
        <article key={row.id} className="grid gap-2 rounded-2xl bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-extrabold">{row.courierName}</p>
              <p className="text-lg font-bold tabular-nums">{formatSom(row.amount)}</p>
              {row.differenceFlagged && <p className="text-sm font-semibold text-amber-800">{t("courier.panel.difference", { amount: formatSom(row.difference) })}</p>}
            </div>
            <p className="text-sm font-bold">{row.status}</p>
          </div>
          <ul className="text-sm text-slate-600">
            {(row.orders || []).map((order) => (
              <li key={order.id}>{order.orderNumber}</li>
            ))}
          </ul>
          {row.note && <p className="text-sm text-slate-500">{row.note}</p>}
          {row.status === "PENDING" && (
            <div className="flex gap-2">
              <LoadingButton type="button" loading={busyId === row.id} onClick={() => act(row.id, "confirm")} className="h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50">
                {t("courier.panel.confirm")}
              </LoadingButton>
              <button type="button" disabled={busyId === row.id} onClick={() => act(row.id, "dispute")} className="h-11 rounded-xl border border-amber-300 px-4 text-sm font-bold text-amber-900">
                {t("courier.panel.dispute")}
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
