import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Building2, Check, Clock, LoaderCircle, LocateFixed, MapPin, Search, XCircle } from "lucide-react";
import {
  branchCoords,
  formatDistanceKm,
  getCurrentLocation,
  haversineKm,
  nearestBranch,
} from "../../lib/geocode";
import { fetchBranches } from "../../services/api";
import { useBranchStore } from "../../store/useBranchStore";
import { EmptyState, ErrorState, SkeletonCard } from "../ui";
import useLockBodyScroll from "../../hooks/useLockBodyScroll";
import { userError } from "../../lib/userError";

export default function BranchModal() {
  const { t } = useTranslation();
  const { branch, isModalOpen, setBranch, closeModal } = useBranchStore();
  const [branches, setBranches] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [origin, setOrigin] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  useLockBodyScroll(isModalOpen);

  function dismiss() {
    closeModal();
  }

  useEffect(() => {
    if (!isModalOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isModalOpen, branch, branches, closeModal, setBranch]);

  useEffect(() => {
    if (!isModalOpen) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    setLoadError("");
    setStatus("");
    setQuery("");
    setOrigin(null);

    fetchBranches()
      .then((data) => {
        if (!active) return;
        setBranches(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!active) return;
        setBranches([]);
        setLoadError(userError(err, t, "error.generic"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || branches.length === 0) return undefined;
    let cancelled = false;

    async function detectNearest() {
      setLocating(true);
      setError("");
      setStatus(t("branch.locatingStatus"));

      try {
        const location = await getCurrentLocation();
        if (cancelled) return;

        setOrigin(location);
        const match = nearestBranch(branches, location);
        if (!match) {
          setStatus(t("branch.nearestFailed"));
          return;
        }

        setStatus(t("branch.nearestFound", { name: match.branch.name, distance: formatDistanceKm(match.distanceKm) }));
      } catch (err) {
        if (cancelled) return;
        setOrigin(null);
        setError(err?.code === "DENIED" ? t("branch.geoDenied") : err?.code === "TIMEOUT" ? t("branch.geoTimeout") : t("branch.geoFailed"));
        setStatus("");
      } finally {
        if (!cancelled) setLocating(false);
      }
    }

    detectNearest();

    return () => {
      cancelled = true;
    };
  }, [isModalOpen, branches]);

  const ranked = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? branches.filter((item) =>
          `${item.name} ${item.address} ${item.district || ""}`.toLowerCase().includes(needle)
        )
      : branches;

    if (!origin) return list.map((item) => ({ ...item, distanceKm: null }));

    return list
      .map((item) => {
        const coords = branchCoords(item);
        return {
          ...item,
          distanceKm: coords ? haversineKm(origin, coords) : Infinity,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [branches, origin, query]);

  const nearestId = origin && ranked[0]?.distanceKm < Infinity ? ranked[0].id : null;

  if (!isModalOpen) return null;

  const handleSelect = (nextBranch) => {
    setBranch(nextBranch);
  };

  const handleLocate = async () => {
    setLocating(true);
    setError("");
    setStatus(t("branch.locatingStatus"));

    try {
      const location = await getCurrentLocation();
      setOrigin(location);
      const match = nearestBranch(branches, location);
      if (!match) {
        setStatus(t("branch.nearestFailed"));
        return;
      }
      setStatus(t("branch.nearestFound", { name: match.branch.name, distance: formatDistanceKm(match.distanceKm) }));
    } catch (err) {
      setOrigin(null);
      setError(err?.code === "DENIED" ? t("branch.geoDenied") : err?.code === "TIMEOUT" ? t("branch.geoTimeout") : t("branch.geoFailed"));
      setStatus("");
    } finally {
      setLocating(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex h-dvh w-full items-center justify-center bg-slate-900/45 p-3 sm:p-5"
      onClick={dismiss}
      role="presentation"
    >
      <div
        className="flex max-h-[min(90dvh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="branch-modal-title"
        aria-modal="true"
      >
        <div className="shrink-0 border-b border-slate-100 px-3 py-3 md:px-6 md:pt-6 md:pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-bold uppercase tracking-wide text-brand ${searchFocused ? "hidden md:block" : ""}`}>{t("branch.pick")}</p>
              <h2 id="branch-modal-title" className="text-base font-extrabold text-slate-900 md:mt-1 md:text-xl">
                {t("branch.question")}
              </h2>
            </div>
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={dismiss}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-50"
            >
              <XCircle className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <p className={`mt-2 text-sm text-slate-500 ${searchFocused ? "hidden" : "line-clamp-2 md:line-clamp-none"}`}>
            {t("branch.note")}
          </p>

          <button
            type="button"
            disabled={locating || loading}
            onClick={handleLocate}
            className={`mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60 sm:w-auto ${searchFocused ? "hidden md:inline-flex" : ""}`}
          >
            {locating ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LocateFixed className="h-4 w-4" aria-hidden />
            )}
            {locating ? t("branch.locating") : t("branch.nearestAction")}
          </button>

          {(status || error) && (
            <p className={`mt-2 text-sm ${error ? "text-red-600" : "text-brand"}`}>
              {error || status}
            </p>
          )}

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={t("branch.search")}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-base outline-none ring-brand/30 focus:ring-2 md:text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          {loading && (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          )}
          {!loading && loadError && (
            <ErrorState
              title={loadError}
              onRetry={() => {
                setLoading(true);
                setLoadError("");
                fetchBranches()
                  .then((data) => setBranches(Array.isArray(data) ? data : []))
                  .catch((err) => setLoadError(userError(err, t, "error.generic")))
                  .finally(() => setLoading(false));
              }}
            />
          )}
          {!loading && !loadError && ranked.length === 0 && (
            <EmptyState title={t("empty.notFound")} body={t("branch.note")} />
          )}

          {!loading && !loadError && (
          <div className="grid gap-3 sm:grid-cols-2">
            {ranked.map((item) => {
              const active = branch?.id === item.id;
              const isNearest = nearestId === item.id;
              const distanceLabel = formatDistanceKm(item.distanceKm);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition-all hover:border-brand hover:shadow-md ${
                    active ? "border-brand bg-brand-soft" : "border-slate-100 bg-white"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Building2 className="h-5 w-5 text-brand" aria-hidden />
                    <span className="flex items-center gap-1.5">
                      {isNearest && (
                        <span className="rounded-full border border-brand/20 bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                          {t("branch.nearest")}
                        </span>
                      )}
                      {active && <Check className="h-5 w-5 text-brand" aria-hidden />}
                    </span>
                  </div>
                  <strong className="block text-slate-900">{item.name}</strong>
                  <span className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                    {item.address}
                  </span>
                  <em className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs not-italic text-slate-500">
                    {distanceLabel && (
                      <span className="inline-flex items-center gap-1 font-semibold text-brand">
                        <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                        {distanceLabel}
                      </span>
                    )}
                    <span>{item.phone}</span>
                    {item.workingHours ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        {item.workingHours}
                      </span>
                    ) : null}
                  </em>
                </button>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
