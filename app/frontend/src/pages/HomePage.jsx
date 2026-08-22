import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MedicineCard from "../components/cards/MedicineCard";
import PromoCarousel from "../components/home/PromoCarousel";
import { CategoryIcon } from "../lib/categoryIcons";
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

  const popular = medicines.filter((item) => !item.isPrescription).slice(0, 8);

  return (
    <div className="grid gap-8">
      <PromoCarousel />

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-extrabold text-slate-900">Kasallik toifalari</h2>
          <p className="text-sm text-slate-500">Kerakli guruhni tanlab, katalogni filtrlashingiz mumkin.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {categories.map((category) => {
            const active = categoryId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategory(category.id)}
                className={`rounded-2xl border p-4 text-left shadow-sm ${
                  active ? "border-brand bg-brand-soft" : "border-slate-100 bg-white"
                }`}
              >
                <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white text-brand">
                  <CategoryIcon name={category.iconName || category.slug} />
                </span>
                <strong className="block text-sm text-slate-900">{category.name}</strong>
              </button>
            );
          })}
        </div>
      </section>

      {!categoryId && !query && popular.length > 0 && (
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-extrabold text-slate-900">Ommabop dori vositalari</h2>
            <p className="text-sm text-slate-500">Faqat retseptsiz, tez buyurtma qilinadigan vositalar.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {popular.map((medicine) => (
              <MedicineCard key={`popular-${medicine.id}`} medicine={medicine} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Barcha dorilar katalogi</h2>
            <p className="text-sm text-slate-500">
              {branch ? `${branch.name} narx va qoldiqlari` : "Katalog uchun filial tanlang"}
            </p>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500">Yuklanmoqda...</p>}
        {!loading && medicines.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-slate-500">
            Mos dori topilmadi.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {medicines.map((medicine) => (
            <MedicineCard key={medicine.id} medicine={medicine} />
          ))}
        </div>
      </section>
    </div>
  );
}
