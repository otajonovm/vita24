import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MedicineCard from "../components/cards/MedicineCard";
import ProductGrid from "../components/cards/ProductGrid";
import CategoryBar from "../components/home/CategoryBar";
import { MOCK_CATEGORIES } from "../lib/mockData";
import { fetchCategories, fetchMedicines } from "../services/api";
import { useBranchStore } from "../store/useBranchStore";

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const branch = useBranchStore((state) => state.branch);
  const [categories, setCategories] = useState(MOCK_CATEGORIES);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
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
    fetchMedicines({ branchId: branch.id, categoryId })
      .then((data) => {
        if (active) setMedicines(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branch, categoryId]);

  const setCategory = (id) => {
    const next = new URLSearchParams(searchParams);
    if (!id || id === categoryId) next.delete("category");
    else next.set("category", id);
    setSearchParams(next);
  };

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">Katalog</h1>
        <p className="mt-1 text-sm text-slate-500">
          {branch ? `${branch.name} narx va qoldiqlari` : "Katalog uchun filial tanlang"}
        </p>
      </div>
      <CategoryBar categories={categories} activeId={categoryId} onSelect={setCategory} />
      {loading && <p className="text-sm text-slate-500">Yuklanmoqda...</p>}
      <ProductGrid>
        {medicines.map((medicine) => (
          <MedicineCard key={medicine.id} medicine={medicine} />
        ))}
      </ProductGrid>
    </div>
  );
}
