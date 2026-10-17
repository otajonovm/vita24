import { useTranslation } from "react-i18next";
import PageMeta from "../components/seo/PageMeta";

const PAGES = {
  terms: {
    titleKey: "legal.termsTitle",
    path: "/terms",
    paragraphs: ["legal.terms.1", "legal.terms.2", "legal.reserve", "legal.terms.3"],
  },
  privacy: {
    titleKey: "legal.privacyTitle",
    path: "/privacy",
    paragraphs: ["legal.privacy.1", "legal.privacy.2", "legal.privacy.3", "legal.privacy.4"],
  },
};

export default function LegalPage({ kind }) {
  const { t } = useTranslation();
  const page = PAGES[kind] || PAGES.terms;
  const title = t(page.titleKey);
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:p-8">
      <PageMeta title={`${title} — Vita24`} description={t(page.paragraphs[0])} path={page.path} />
      <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
      <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-600">
        {page.paragraphs.map((paragraph) => (
          <p key={paragraph}>{t(paragraph)}</p>
        ))}
      </div>
    </article>
  );
}
