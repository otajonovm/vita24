import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MedicineCard from "../components/cards/MedicineCard";
import ProductGrid from "../components/cards/ProductGrid";
import CategoryBar from "../components/home/CategoryBar";
import PromoCarousel from "../components/home/PromoCarousel";
import { MOCK_CATEGORIES } from "../lib/mockData";
import { fetchCategories, fetchMedicines } from "../services/api";
import { useBranchStore } from "../store/useBranchStore";

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const branch = useBranchStore((state) => state.branch);
  const [categories, setCategories] = useState(MOCK_CATEGORIES);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const query = searchParams.get("q") || "";
  const categoryId = searchParams.get("category") || "";

  useEffect(() => {
    fetchCategories().then((data) => {
      if (Array.isArray(data) && data.length > 0) setCategories(data);
    });
  }, []);

  useEffect(() => {
    if (!branch) {
      setMedicines([]);
      return undefined;
    }

    let active = true;
    setLoading(true);
    fetchMedicines({ branchId: branch.id, search: query, categoryId })
      .then((data) => {
        if (active) setMedicines(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branch, query, categoryId]);

  const setCategory = (id) => {
    const next = new URLSearchParams(searchParams);
    if (!id || id === categoryId) next.delete("category");
    else next.set("category", id);
    setSearchParams(next);
  };

  return (
    <div className="grid w-full min-w-0 gap-4 md:gap-5 lg:gap-8">
      <PromoCarousel />
      <CategoryBar categories={categories} activeId={categoryId} onSelect={setCategory} />

      <section className="min-w-0">
        <div className="mb-2.5 flex items-end justify-between gap-3 md:mb-3">
          <h2 className="min-w-0 text-base font-extrabold text-slate-900 md:text-xl">
            {query ? "Qidiruv natijasi" : "Mashhur dorilar"}
          </h2>
          <span className="shrink-0 text-xs font-semibold text-slate-400">{medicines.length} ta</span>
        </div>

        {loading && <p className="text-sm text-slate-500">Yuklanmoqda...</p>}
        {!loading && medicines.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm text-slate-500">
            Mos dori topilmadi.
          </p>
        )}

        <ProductGrid>
          {medicines.map((medicine) => (
            <MedicineCard key={medicine.id} medicine={medicine} />
          ))}
        </ProductGrid>
      </section>
    </div>
  );
}
