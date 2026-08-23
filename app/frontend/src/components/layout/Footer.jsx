import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Clock, PhoneCall, ShieldCheck } from "lucide-react";

const SECTIONS = [
  {
    id: "contact",
    title: "24/7 aloqa",
    body: (
      <div className="space-y-1.5 text-sm">
        <p className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4" />
          1095
        </p>
        <p className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4" />
          +998 71 200 24 24
        </p>
      </div>
    ),
  },
  {
    id: "links",
    title: "Bo'limlar",
    body: (
      <div className="flex flex-col gap-2 text-sm">
        <Link to="/catalog" className="text-inherit no-underline hover:text-white">
          Katalog
        </Link>
        <Link to="/cart" className="text-inherit no-underline hover:text-white">
          Savatcha
        </Link>
        <Link to="/branch-admin" className="text-inherit no-underline hover:text-white">
          Farmatsevt paneli
        </Link>
        <Link to="/admin" className="text-inherit no-underline hover:text-white">
          Super admin
        </Link>
      </div>
    ),
  },
  {
    id: "trust",
    title: "Ishonch",
    body: (
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Chilonzor va Mirzo Ulug'bek — 24/7
        </p>
        <p className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Litsenziyalangan dorixona tarmog'i
        </p>
      </div>
    ),
  },
];

export default function Footer() {
  const [openId, setOpenId] = useState("");

  return (
    <footer className="mt-auto hidden bg-[#083929] text-[#d7efe4] lg:block">
      <div className="mx-auto hidden max-w-7xl grid-cols-4 gap-8 px-6 py-10 lg:grid">
        <div>
          <strong className="text-lg text-white">Vita24</strong>
          <p className="mt-2 text-sm leading-6 text-[#9cc4b3]">
            Ko'p filialli onlayn dorixona. 24/7 buyurtma, 15 daqiqalik zaxira va farmatsevt nazorati.
          </p>
        </div>
        {SECTIONS.map((section) => (
          <div key={section.id}>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-soft">
              {section.title}
            </span>
            <div className="mt-2">{section.body}</div>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 lg:hidden">
        <strong className="text-base text-white">Vita24</strong>
        <p className="mt-2 text-sm leading-6 text-[#9cc4b3]">
          24/7 onlayn dorixona. Filial tanlang, zaxira qiling, farmatsevt tasdig'idan so'ng to'lang.
        </p>
        <div className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10">
          {SECTIONS.map((section) => {
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

      <p className="mx-auto max-w-7xl border-t border-white/10 px-4 py-4 text-sm text-[#9cc4b3] md:px-6">
        {new Date().getFullYear()} Vita24. Barcha huquqlar himoyalangan.
      </p>
    </footer>
  );
}
