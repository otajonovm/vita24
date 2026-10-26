import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createSearchSynonym, deleteSearchSynonym, fetchSearchAdmin, updateSearchSynonym } from "../../services/api";

const TYPES = ["BRAND", "INGREDIENT", "SYMPTOM", "SPELLING"];
const EMPTY = { term: "", canonical: "", type: "SYMPTOM" };

export function SearchAdminPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await fetchSearchAdmin());
    } catch (err) {
      setError(err?.message || t("error.generic"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event) {
    event.preventDefault();
    setError("");
    try {
      if (editing) await updateSearchSynonym(editing, form);
      else await createSearchSynonym(form);
      setForm(EMPTY);
      setEditing("");
      await load();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.message || t("error.generic"));
    }
  }

  async function remove(id) {
    setError("");
    try {
      await deleteSearchSynonym(id);
      if (editing === id) {
        setEditing("");
        setForm(EMPTY);
      }
      await load();
    } catch (err) {
      setError(err?.message || t("error.generic"));
    }
  }

  function beginAdd(query) {
    setEditing("");
    setForm({ term: query, canonical: "", type: "SYMPTOM" });
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">{t("admin.search.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("admin.search.hint")}</p>
      </div>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-500">{t("common.loading")}</p> : null}
      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("admin.search.conversion")}</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">{data.conversion?.rate || 0}%</p>
              <p className="mt-1 text-sm text-slate-500">
                {data.conversion?.clicks || 0} / {data.conversion?.searches || 0}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 md:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("admin.search.top")}</p>
              <ul className="mt-2 grid gap-1">
                {(data.top || []).map((row) => (
                  <li key={row.normalized} className="flex justify-between text-sm">
                    <span className="font-medium text-slate-800">{row.query}</span>
                    <span className="tabular-nums text-slate-500">{row.count}</span>
                  </li>
                ))}
                {!data.top?.length ? <li className="text-sm text-slate-500">{t("admin.search.empty")}</li> : null}
              </ul>
            </article>
          </div>
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("admin.search.zero")}</p>
            <ul className="mt-2 grid gap-2">
              {(data.zero || []).map((row) => (
                <li key={row.normalized} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">
                    {row.query} <span className="text-slate-400">({row.count})</span>
                  </span>
                  <button type="button" className="rounded-lg bg-[#087B51] px-3 py-1.5 text-xs font-bold text-white" onClick={() => beginAdd(row.query)}>
                    {t("admin.search.addSynonym")}
                  </button>
                </li>
              ))}
              {!data.zero?.length ? <li className="text-sm text-slate-500">{t("admin.search.empty")}</li> : null}
            </ul>
          </article>
        </>
      ) : null}
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input
          value={form.term}
          onChange={(event) => setForm({ ...form, term: event.target.value })}
          placeholder={t("admin.search.term")}
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
          required
        />
        <input
          value={form.canonical}
          onChange={(event) => setForm({ ...form, canonical: event.target.value })}
          placeholder={t("admin.search.canonical")}
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
          required
        />
        <select
          value={form.type}
          onChange={(event) => setForm({ ...form, type: event.target.value })}
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-xl bg-[#087B51] text-sm font-bold text-white">
          {t("admin.search.save")}
        </button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">{t("admin.search.term")}</th>
              <th className="px-3 py-2">{t("admin.search.canonical")}</th>
              <th className="px-3 py-2">{t("admin.search.type")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data?.synonyms || []).map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800">{row.term}</td>
                <td className="px-3 py-2">{row.canonical}</td>
                <td className="px-3 py-2">{row.type}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="mr-2 font-semibold text-[#087B51]"
                    onClick={() => {
                      setEditing(row.id);
                      setForm({ term: row.term, canonical: row.canonical, type: row.type });
                    }}
                  >
                    {t("admin.search.edit")}
                  </button>
                  <button type="button" className="font-semibold text-red-600" onClick={() => remove(row.id)}>
                    {t("admin.search.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
