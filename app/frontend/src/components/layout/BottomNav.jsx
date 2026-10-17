import { NavLink } from "react-router-dom";
import { Heart, Home, LayoutGrid, ShoppingCart, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCartStore } from "../../store/useCartStore";

const TABS = [
  { to: "/", labelKey: "nav.home", Icon: Home, end: true },
  { to: "/catalog", labelKey: "nav.catalog", Icon: LayoutGrid },
  { to: "/cart", labelKey: "nav.cartShort", Icon: ShoppingCart, cart: true },
  { to: "/favorites", labelKey: "nav.favorites", Icon: Heart },
  { to: "/profile", labelKey: "nav.profile", Icon: User },
];

export default function BottomNav() {
  const { t } = useTranslation();
  const itemCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 block border-t border-slate-100 bg-white/95 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-0.5 pb-[max(0.35rem,var(--tg-safe-bottom,env(safe-area-inset-bottom)))] pt-1.5">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `relative flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-1 no-underline ${
                isActive ? "text-[#087b51]" : "text-slate-400"
              }`
            }
          >
            {() => (
              <>
                <span className="relative">
                  <tab.Icon className="h-5 w-5" aria-hidden />
                  {tab.cart && itemCount > 0 && (
                    <b className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#087b51] px-1 text-[10px] font-bold text-white">
                      {itemCount}
                    </b>
                  )}
                </span>
                <span className="w-full truncate text-center text-[10px] font-semibold leading-none tracking-tight">
                  {t(tab.labelKey)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
