import { NavLink } from "react-router-dom";
import { ClipboardList, Heart, Home, LayoutGrid, ShoppingCart } from "lucide-react";
import { useCartStore } from "../../store/useCartStore";

const TABS = [
  { to: "/", label: "Bosh sahifa", Icon: Home, end: true },
  { to: "/catalog", label: "Katalog", Icon: LayoutGrid },
  { to: "/cart", label: "Savatcha", Icon: ShoppingCart, cart: true },
  { to: "/favorites", label: "Sevimlilar", Icon: Heart },
  { to: "/orders", label: "Buyurtmalarim", Icon: ClipboardList },
];

export default function BottomNav() {
  const itemCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 block border-t border-slate-100 bg-white/95 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-3xl grid-cols-5 px-1 pb-[max(0.4rem,var(--tg-safe-bottom,env(safe-area-inset-bottom)))] pt-1.5">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-1 no-underline ${
                isActive ? "text-brand" : "text-slate-400"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <tab.Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
                  {tab.cart && itemCount > 0 && (
                    <b className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                      {itemCount}
                    </b>
                  )}
                </span>
                <span className="text-[10px] font-semibold leading-tight">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
