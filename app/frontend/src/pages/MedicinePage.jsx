import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { FileText, Heart, Minus, Pill, Plus } from "lucide-react";
import PageMeta from "../components/seo/PageMeta";
import { formatSom } from "../lib/format";
import { resolveMediaUrl } from "../lib/media";
import { userError } from "../lib/userError";
import { fetchMedicineBySlug } from "../services/api";
import { useBranchStore } from "../store/useBranchStore";
import { useCartStore } from "../store/useCartStore";
import { useFavoritesStore } from "../store/useFavoritesStore";
import { useToastStore } from "../store/useToastStore";
import { ErrorState } from "../components/ui";
import useSoftKeyboard from "../hooks/useSoftKeyboard";

function shown(value) {
  const text = String(value ?? "").trim();
  if (!text || /^noma['’]lum$/i.test(text)) return "";
  return text;
}

function sameText(left, right) {
  return shown(left).toLocaleLowerCase("uz") === shown(right).toLocaleLowerCase("uz");
}

function packUnit(form, t) {
  const text = String(form || "").toLowerCase();
  if (text.includes("kapsul")) return t("medicine.unitCapsule");
  if (text.includes("tablet")) return t("medicine.unitTablet");
  return t("medicine.unitPiece");
}

function availabilityLabel(item, t) {
  const level = item.level || (Number(item.available) > 0 ? "in" : item.available ? "in" : "out");
  if (level === "low") return t("medicine.low");
  if (level === "out" || item.available === false || Number(item.available) === 0) return t("medicine.out");
  return t("medicine.inStock");
}

export default function MedicinePage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const branch = useBranchStore((state) => state.branch);
  const addToCart = useCartStore((state) => state.addToCart);
  const getLineQuantity = useCartStore((state) => state.getLineQuantity);
  const isFavorite = useFavoritesStore((state) => state.isFavorite);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
  const pushToast = useToastStore((state) => state.push);
  const [medicine, setMedicine] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const keyboard = useSoftKeyboard();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setQty(1);
    fetchMedicineBySlug(slug, branch?.id)
      .then((data) => {
        if (active) setMedicine(data);
      })
      .catch((err) => {
        if (active) setError(userError(err, t, "medicine.missing"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, branch?.id, t]);

  if (loading) {
    return (
      <article className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-[280px_1fr] md:p-6">
        <div className="h-40 animate-pulse rounded-2xl bg-emerald-50/80 md:h-64" />
        <div className="grid content-start gap-3">
          <div className="h-7 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100" />
          <div className="h-12 w-40 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </article>
    );
  }
  if (error || !medicine) {
    return (
      <ErrorState
        title={error || t("medicine.missing")}
        onRetry={() => {
          setLoading(true);
          setError("");
          fetchMedicineBySlug(slug, branch?.id)
            .then((data) => setMedicine(data))
            .catch((err) => setError(userError(err, t, "medicine.missing")))
            .finally(() => setLoading(false));
        }}
      />
    );
  }

  const image = resolveMediaUrl(medicine.imageUrl);
  const price = medicine.price == null ? null : formatSom(medicine.price);
  const stock = Number(medicine.stockCount) || 0;
  const room = Math.max(0, stock - getLineQuantity(medicine.id, "tabletka"));
  const favorite = isFavorite(medicine.id);
  const facts = [
    [t("medicine.dosage"), shown(medicine.dosage)],
    [t("medicine.form"), shown(medicine.dosageForm)],
    [t("medicine.pack"), Number(medicine.quantityInPack) > 0 ? t("medicine.packValue", { count: medicine.quantityInPack, unit: packUnit(medicine.dosageForm, t) }) : ""],
    [t("medicine.maker"), shown(medicine.manufacturer)],
    [t("medicine.usage"), sameText(medicine.usage, medicine.description) ? "" : shown(medicine.usage)],
    [t("medicine.contra"), shown(medicine.contraindications)],
    [t("medicine.storage"), shown(medicine.storageConditions)],
  ].filter(([, value]) => value);
  const analogs = Array.isArray(medicine.analogs) ? medicine.analogs : [];

  const add = () => {
    if (!branch || room < 1) return;
    const added = addToCart(medicine, branch.id, "tabletka", qty);
    if (!added) {
      pushToast(t("cart.onlyLeft", { count: stock }));
      return;
    }
    pushToast(
      medicine.isPrescription
        ? t("medicine.addedRx", { name: medicine.name })
        : t("medicine.added", { name: medicine.name }),
      "info",
      { duration: 1800 }
    );
    setQty(1);
  };

  return (
    <article className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-4 pb-6 shadow-sm md:grid-cols-[280px_1fr] md:p-6">
      <PageMeta
        title={`${medicine.name} — Vita24`}
        description={medicine.description || medicine.name}
        image={image || "/logo.jpg"}
        path={`/medicine/${medicine.slug}`}
      />
      <div className={`grid place-items-center rounded-2xl bg-emerald-50/70 ${image ? "h-52 md:h-64" : "h-40 md:h-64"}`}>
        {image ? (
          <img src={image} alt={medicine.name} className="h-full w-full object-contain p-4" />
        ) : (
          <Pill className="h-16 w-16 text-[#087B51]" aria-hidden />
        )}
      </div>
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{medicine.name}</h1>
        {shown(medicine.description) ? <p className="mt-2 text-sm text-slate-600">{medicine.description}</p> : null}
        {medicine.isPrescription && (
          <p className="mt-3 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-600">
            <FileText className="h-3.5 w-3.5" aria-hidden /> {t("medicine.rxRequired")}
          </p>
        )}
        {medicine.isPrescription && (
          <p className="mt-2 text-sm text-slate-600">{t("medicine.rxNote")}</p>
        )}
        <p className="mt-4 text-xl font-extrabold tabular-nums">
          {branch && price ? price : t("medicine.priceAfterBranch")}
        </p>

        <button
          type="button"
          onClick={() => {
            toggleFavorite(medicine);
            pushToast(favorite ? t("medicine.favOff") : t("medicine.favOn"));
          }}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 md:hidden"
        >
          <Heart className={`h-4 w-4 ${favorite ? "fill-red-500 text-red-500" : ""}`} aria-hidden />
          {favorite ? t("medicine.favRemove") : t("medicine.favAdd")}
        </button>
        <div className="mt-4 hidden items-center gap-3 md:flex">
          <div className="inline-flex h-12 shrink-0 items-center gap-1 rounded-xl bg-[#e7f6ef] px-1">
            <button
              type="button"
              aria-label={t("medicine.decrease")}
              disabled={qty <= 1}
              onClick={() => setQty((current) => Math.max(1, current - 1))}
              className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-800 shadow-sm disabled:opacity-40"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-8 text-center text-sm font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label={t("medicine.increase")}
              disabled={qty >= room}
              title={qty >= room ? t("cart.onlyLeft", { count: stock }) : undefined}
              onClick={() => setQty((current) => Math.min(room, current + 1))}
              className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-800 shadow-sm disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            disabled={!branch || room < 1}
            onClick={add}
            className="h-12 rounded-xl bg-[#087B51] px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {room < 1 ? t("medicine.soldOut") : t("medicine.add")}
          </button>
          <button
            type="button"
            onClick={() => {
              toggleFavorite(medicine);
              pushToast(favorite ? t("medicine.favOff") : t("medicine.favOn"));
            }}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700"
          >
            <Heart className={`h-4 w-4 ${favorite ? "fill-red-500 text-red-500" : ""}`} aria-hidden />
            {favorite ? t("medicine.favRemove") : t("medicine.favAdd")}
          </button>
        </div>
        {branch && room < 1 && stock > 0 ? (
          <p className="mt-2 text-xs font-semibold text-amber-700">{t("cart.onlyLeft", { count: stock })}</p>
        ) : null}

        {facts.length > 0 && (
          <dl className="mt-6 grid gap-2">
            {facts.map(([label, value]) => (
              <div key={label} className="grid gap-0.5 rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-xs font-semibold text-slate-400">{label}</dt>
                <dd className="text-sm text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {analogs.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-bold text-slate-900">{t("medicine.analogs")}</h2>
            <ul className="mt-2 grid gap-2">
              {analogs.map((item) => {
                const left = Number(item.available ?? item.stockCount) || 0;
                return (
                  <li key={item.id}>
                    <Link
                      to={`/medicine/${item.slug}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-inherit no-underline"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">{item.name}</span>
                        {shown(item.dosage) ? <span className="text-xs text-slate-500">{item.dosage}</span> : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold tabular-nums">{item.price == null ? "—" : formatSom(item.price)}</span>
                        <span className={left > 0 ? "text-xs font-semibold text-[#087B51]" : "text-xs text-slate-400"}>
                          {left <= 0 ? t("medicine.out") : left <= 5 ? t("medicine.low") : t("medicine.inStock")}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <h2 className="mt-6 text-sm font-bold text-slate-900">{t("medicine.availability")}</h2>
        <ul className="mt-2 grid gap-2">
          {(medicine.availability || []).map((item) => (
            <li key={item.branchId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0">{item.name}</span>
              <span className={`shrink-0 ${availabilityLabel(item, t) === t("medicine.out") ? "text-slate-400" : "font-bold text-[#087B51]"}`}>
                {availabilityLabel(item, t)}
              </span>
            </li>
          ))}
        </ul>
        <Link to="/catalog" className="mt-4 inline-flex h-10 items-center text-sm font-bold text-[#087B51]">
          {t("medicine.back")}
        </Link>
      </div>
      {!keyboard && (
        <div
          className="fixed inset-x-0 z-20 border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:hidden"
          style={{ bottom: "calc(var(--bottom-nav-h) + var(--tg-safe-bottom, env(safe-area-inset-bottom)))" }}
        >
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-extrabold tabular-nums text-slate-900">
              {branch && price ? price : t("medicine.priceAfterBranch")}
            </p>
            <div className="inline-flex shrink-0 items-center rounded-xl bg-[#e7f6ef] p-0.5">
              <button
                type="button"
                aria-label={t("medicine.decrease")}
                disabled={qty <= 1}
                onClick={() => setQty((current) => Math.max(1, current - 1))}
                className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-800 shadow-sm disabled:opacity-40"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="min-w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
              <button
                type="button"
                aria-label={t("medicine.increase")}
                disabled={qty >= room}
                onClick={() => setQty((current) => Math.min(room, current + 1))}
                className="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-800 shadow-sm disabled:opacity-40"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              disabled={!branch || room < 1}
              onClick={add}
              className="h-10 shrink-0 rounded-xl bg-[#087B51] px-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {room < 1 ? t("medicine.soldOut") : t("medicine.add")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
