import { Link } from "react-router-dom";
import { Clock, PhoneCall, ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-auto bg-[#083929] text-[#d7efe4]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-4">
        <div>
          <strong className="text-lg text-white">Vita24</strong>
          <p className="mt-2 text-sm leading-6 text-[#9cc4b3]">
            Ko'p filialli onlayn dorixona. 24/7 buyurtma, 15 daqiqalik zaxira va
            farmatsevt nazorati.
          </p>
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-soft">
            24/7 aloqa
          </span>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <PhoneCall className="h-4 w-4" />
            1095
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <PhoneCall className="h-4 w-4" />
            +998 71 200 24 24
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-soft">
            Bo'limlar
          </span>
          <Link to="/" className="text-inherit no-underline hover:text-white">
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
        <div className="space-y-3 text-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-soft">
            Ishonch
          </span>
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Chilonzor va Mirzo Ulug'bek — 24/7
          </p>
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Litsenziyalangan dorixona tarmog'i
          </p>
        </div>
      </div>
      <p className="mx-auto max-w-6xl border-t border-white/10 px-4 py-4 text-sm text-[#9cc4b3]">
        {new Date().getFullYear()} Vita24. Barcha huquqlar himoyalangan.
      </p>
    </footer>
  );
}
