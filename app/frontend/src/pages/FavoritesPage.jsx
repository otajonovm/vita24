import { LiaHeartSolid } from "react-icons/lia";
import { Link } from "react-router-dom";
import MedicineCard from "../components/cards/MedicineCard";
import ProductGrid from "../components/cards/ProductGrid";
import { useFavoritesStore } from "../store/useFavoritesStore";

export default function FavoritesPage() {
  const items = useFavoritesStore((state) => state.items);

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e7f6ef] text-[#087b51]">
          <LiaHeartSolid className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="mt-3 text-xl font-extrabold text-slate-900">Sevimlilar bo'sh</h1>
        <p className="mt-1 text-sm text-slate-500">Kartochkadagi yurakcha orqali qo'shing.</p>
        <Link
          to="/catalog"
          className="mt-5 inline-flex h-12 items-center rounded-xl bg-[#087b51] px-4 text-sm font-bold text-white hover:bg-[#066341] md:h-11"
        >
          Katalogga o'tish
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-extrabold text-slate-900">Sevimlilar</h1>
      <ProductGrid>
        {items.map((medicine) => (
          <MedicineCard key={medicine.id} medicine={medicine} />
        ))}
      </ProductGrid>
    </div>
  );
}
