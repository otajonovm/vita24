import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Clock, PhoneCall, ShieldCheck } from "lucide-react";
import { loadPublicSettings, peekPublicSettings } from "../../lib/publicSettings";
import { useBranchStore } from "../../store/useBranchStore";

export default function Footer() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const branch = useBranchStore((state) => state.branch);
  const [openId, setOpenId] = useState("");
  const [shop, setShop] = useState(() => peekPublicSettings());
  useEffect(() => {
    loadPublicSettings().then(setShop).catch(() => {});
  }, []);
  const hours = branch?.name
    ? t("footer.branchLine", { name: branch.name, hours: branch.workingHours || "—" })
    : t("footer.pickBranch");
  const year = new Date().getFullYear();

  const sections = [
    {
      id: "contact",
      title: t("footer.contact"),
      body: (
        <div className="space-y-1.5 text-sm">
          <a href={`tel:${String(shop.contactPhone || "").replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-inherit no-underline">
            <PhoneCall className="h-4 w-4" />
            {shop.contactPhone}
          </a>
          <a href={`tel:${String(shop.contactPhoneAlt || "").replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-inherit no-underline">
            <PhoneCall className="h-4 w-4" />
            {shop.contactPhoneAlt}
          </a>
        </div>
      ),
    },
    {
      id: "links",
      title: t("footer.links"),
      body: (
        <div className="flex flex-col gap-2 text-sm">
          <Link to="/catalog" className="text-inherit no-underline hover:text-white">
            {t("nav.catalog")}
          </Link>
          <Link to="/cart" className="text-inherit no-underline hover:text-white">
            {t("nav.cart")}
          </Link>
          <Link to="/privacy" className="text-inherit no-underline hover:text-white">
            {t("footer.privacy")}
          </Link>
          <Link to="/terms" className="text-inherit no-underline hover:text-white">
            {t("footer.terms")}
          </Link>
        </div>
      ),
    },
    {
      id: "trust",
      title: t("footer.trust"),
      body: (
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {hours}
          </p>
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {shop.footerLicensed || t("footer.licensed")}
          </p>
        </div>
      ),
    },
  ];

  const onCart = pathname === "/cart";
  const onMedicine = pathname.startsWith("/medicine/");
  const clearance = onCart
    ? "hidden lg:block"
    : onMedicine
      ? "pb-[calc(var(--bottom-nav-h)+4.75rem+var(--tg-safe-bottom,env(safe-area-inset-bottom)))] md:pb-[calc(var(--bottom-nav-h)+var(--tg-safe-bottom,env(safe-area-inset-bottom)))] lg:pb-0"
      : "pb-[calc(var(--bottom-nav-h)+var(--tg-safe-bottom,env(safe-area-inset-bottom)))] lg:pb-0";

  return (
    <footer className={`mt-auto bg-[#083929] text-[#d7efe4] ${clearance}`}>
      <div className="mx-auto hidden max-w-7xl grid-cols-4 gap-8 px-6 py-10 lg:grid">
        <div>
          <strong className="text-lg text-white">Vita24</strong>
          <p className="mt-2 text-sm leading-6 text-[#9cc4b3]">{t("footer.about")}</p>
        </div>
        {sections.map((section) => (
          <div key={section.id}>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-soft">
              {section.title}
            </span>
            <div className="mt-2">{section.body}</div>
          </div>
        ))}
      </div>

      {!onCart && (
        <div className="mx-auto max-w-7xl px-4 py-6 lg:hidden">
          <strong className="text-base text-white">Vita24</strong>
          <p className="mt-2 text-sm leading-6 text-[#9cc4b3]">{t("footer.short")}</p>
          <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10">
            {sections.map((section) => {
              const open = openId === section.id;
              return (
                <div key={section.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? "" : section.id)}
                    className="flex h-12 w-full items-center justify-between px-3 text-left text-sm font-bold text-white"
                  >
                    {section.title}
                    <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && <div className="px-3 pb-3">{section.body}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mx-auto max-w-7xl border-t border-white/10 px-4 py-4 text-sm text-[#9cc4b3] md:px-6">
        {t("footer.rights", { year })}
      </p>
    </footer>
  );
}
