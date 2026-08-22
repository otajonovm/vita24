import { useEffect, useMemo, useState } from "react";
import { Building2, Pill, ShieldCheck } from "lucide-react";
import { formatSom } from "../lib/format";
import { fetchBranches, fetchMedicines } from "../services/api";

export default function SuperAdminPage() {
  const [branches, setBranches] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const branchData = await fetchBranches();
      const firstId = branchData[0]?.id;
      const medicineData = firstId ? await fetchMedicines({ branchId: firstId }) : [];
      if (!active) return;
      setBranches(branchData);
      setMedicines(medicineData);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const rx = medicines.filter((item) => item.isPrescription).length;
    const catalogValue = medicines.reduce((sum, item) => sum + item.price * item.stockCount, 0);
    return [
      { label: "Filiallar", value: branches.length, Icon: Building2 },
      { label: "Katalogdagi dorilar", value: medicines.length, Icon: Pill },
      { label: "Retseptli vositalar", value: rx, Icon: ShieldCheck },
      { label: "Ombor qiymati", value: formatSom(catalogValue), Icon: ShieldCheck },
    ];
  }, [branches, medicines]);

  return (
    <section className="grid gap-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Super admin</p>
        <h1 className="text-3xl font-extrabold">Vita24 boshqaruv paneli</h1>
        <p className="text-sm text-slate-500">Umumiy statistika, filiallar va dori katalogi.</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Yuklanmoqda...</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <article key={item.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <item.Icon className="h-5 w-5 text-brand" />
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
            <strong className="mt-1 block text-2xl font-extrabold tabular-nums">{item.value}</strong>
          </article>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-extrabold">Filiallar</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {branches.map((branch) => (
            <article key={branch.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-brand">
                <Building2 className="h-4 w-4" />
                <strong className="text-slate-900">{branch.name}</strong>
              </div>
              <p className="mt-2 text-sm text-slate-500">{branch.address}</p>
              <p className="mt-1 text-sm text-slate-500">{branch.phone}</p>
              <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                {branch.isActive === false ? "Nofaol" : "Faol"}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-extrabold">Dori katalogi</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2">Nomi</th>
                <th className="pb-2">Dozasi</th>
                <th className="pb-2">Narx</th>
                <th className="pb-2">Qoldiq</th>
                <th className="pb-2">Retsept</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((medicine) => (
                <tr key={medicine.id} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{medicine.name}</td>
                  <td>{medicine.dosage}</td>
                  <td className="tabular-nums">{formatSom(medicine.price)}</td>
                  <td>{medicine.stockCount}</td>
                  <td>
                    {medicine.isPrescription ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-600">
                        Ha
                      </span>
                    ) : (
                      "Yo'q"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
