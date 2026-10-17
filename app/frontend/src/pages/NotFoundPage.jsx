import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import PageMeta from "../components/seo/PageMeta";

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
      <PageMeta title={`${t("notFound.title")} — Vita24`} description={t("notFound.meta")} path="/404" />
      <p className="text-sm font-bold uppercase tracking-wide text-[#087B51]">404</p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{t("notFound.title")}</h1>
      <p className="mt-2 text-sm text-slate-500">{t("notFound.text")}</p>
      <Link to="/" className="mt-5 inline-flex h-11 items-center rounded-xl bg-[#087B51] px-4 text-sm font-bold text-white">
        {t("common.home")}
      </Link>
    </section>
  );
}
