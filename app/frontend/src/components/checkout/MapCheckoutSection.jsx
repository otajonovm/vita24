import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, LocateFixed, MapPin } from "lucide-react";
import { geocodePlace, getAccurateLocation, reverseGeocode, searchPlaces } from "../../lib/geocode";

const DEFAULT_CENTER = { lat: 41.3111, lng: 69.2797 };

function mapSrc(lat, lng) {
  const pad = 0.006;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - pad}%2C${lat - pad * 0.65}%2C${lng + pad}%2C${lat + pad * 0.65}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export default function MapCheckoutSection({
  street,
  apartment,
  floor,
  intercom,
  entrance = "",
  landmark = "",
  lat,
  lng,
  onChange,
  onBlur,
  inputRef,
  invalid,
  city = "Toshkent",
}) {
  const { t } = useTranslation();
  const typedRef = useRef(false);
  const [draft, setDraft] = useState(street || "");
  const [center, setCenter] = useState(() => ({
    lat: Number.isFinite(lat) ? lat : DEFAULT_CENTER.lat,
    lng: Number.isFinite(lng) ? lng : DEFAULT_CENTER.lng,
  }));
  const [suggestions, setSuggestions] = useState([]);
  const [openSuggest, setOpenSuggest] = useState(false);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setCenter({ lat, lng });
    }
  }, [lat, lng]);

  useEffect(() => {
    if (!typedRef.current) setDraft(street || "");
  }, [street]);

  const applyPlace = (place) => {
    if (!place?.lat || !place?.lng) return;
    typedRef.current = false;
    setDraft(place.title || "");
    setCenter({ lat: place.lat, lng: place.lng });
    onChange({
      street: place.title,
      lat: place.lat,
      lng: place.lng,
    });
    setSuggestions([]);
    setOpenSuggest(false);
    setStatus("");
  };

  useEffect(() => {
    if (!typedRef.current) return undefined;
    const needle = draft.trim();
    if (needle.length < 3) {
      setSuggestions([]);
      setOpenSuggest(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      if (!typedRef.current) return;
      try {
        const rows = await searchPlaces(needle, center, city);
        if (!typedRef.current) return;
        setSuggestions(rows);
        setOpenSuggest(rows.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [draft, city]);

  const handleLocate = async () => {
    setLocating(true);
    setStatus("");
    setAccuracy(null);
    try {
      const gps = await getAccurateLocation((reading) => {
        setAccuracy(Math.round(reading.accuracy));
        setCenter({ lat: reading.lat, lng: reading.lng });
      });
      setAccuracy(Math.round(gps.accuracy));
      const title = await reverseGeocode(gps.lat, gps.lng);
      applyPlace({ title, lat: gps.lat, lng: gps.lng });
    } catch (error) {
      setStatus(error?.code === "DENIED" ? t("branch.geoDenied") : error?.code === "TIMEOUT" ? t("branch.geoTimeout") : t("address.gpsFailed"));
    } finally {
      setLocating(false);
    }
  };

  const handlePick = async (item) => {
    if (item.lat && item.lng) {
      applyPlace(item);
      return;
    }
    const place = await geocodePlace(item.title);
    if (place) applyPlace(place);
  };

  const suggestRef = useRef(null);

  useEffect(() => {
    if (!openSuggest) return undefined;
    const onPointer = (event) => {
      if (!suggestRef.current?.contains(event.target)) setOpenSuggest(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpenSuggest(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openSuggest]);

  const handleEnter = async (event) => {
    if (event.key === "Escape") {
      setOpenSuggest(false);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (suggestions[0]) {
      handlePick(suggestions[0]);
      return;
    }
    const place = await geocodePlace(draft);
    if (place) applyPlace(place);
    else setStatus(t("address.notFound"));
  };

  return (
    <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${invalid ? "border-red-500" : "border-slate-100"}`}>
      <div className="osm-frame relative bg-slate-100">
        <iframe
          key={`${center.lat.toFixed(5)}-${center.lng.toFixed(5)}`}
          title={t("address.map")}
          src={mapSrc(center.lat, center.lng)}
          loading="lazy"
        />
      </div>
      <p className="px-3 pt-1 text-[10px] leading-tight text-slate-400">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-slate-400">
          {t("address.mapCredit")}
        </a>
      </p>

      <div className="grid gap-3 p-3">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          {t("address.label")}
          <span className="relative" ref={suggestRef}>
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={draft}
              autoComplete="off"
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                typedRef.current = true;
                const value = event.target.value;
                setDraft(value);
                onChange({ street: value, lat: null, lng: null });
              }}
              onFocus={() => typedRef.current && suggestions.length > 0 && setOpenSuggest(true)}
              onBlur={() => {
                setTimeout(() => setOpenSuggest(false), 180);
                onBlur?.();
              }}
              onKeyDown={handleEnter}
              placeholder={t("address.placeholder")}
              className={`h-12 w-full scroll-mb-40 rounded-xl border bg-white pl-10 pr-14 text-sm font-normal outline-none ring-brand/30 focus:ring-2 ${invalid ? "border-red-500" : "border-slate-200"}`}
            />
            <button
              type="button"
              onClick={handleLocate}
              disabled={locating}
              aria-label={t("address.mine")}
              className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {locating ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
            </button>
            {openSuggest && suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                {suggestions.map((item) => (
                  <button
                    key={`${item.title}-${item.lat}-${item.lng}`}
                    type="button"
                    className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50"
                    onMouseDown={() => handlePick(item)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <span className="text-sm text-slate-800">{item.title}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        </label>
        {locating && (
          <p className="text-xs text-brand">
            {t("address.gps", { extra: accuracy ? ` (${accuracy} m)` : "" })}
          </p>
        )}
        {status && <p className="text-xs text-red-600">{status}</p>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            {t("address.apt")}
            <input
              value={apartment}
              onChange={(event) => onChange({ apartment: event.target.value })}
              placeholder={t("address.aptPh")}
              className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            {t("address.entrance")}
            <input
              value={entrance}
              onChange={(event) => onChange({ entrance: event.target.value })}
              placeholder={t("address.entrancePh")}
              className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            {t("address.floor")}
            <input
              value={floor}
              onChange={(event) => onChange({ floor: event.target.value })}
              placeholder={t("address.floorPh")}
              className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            {t("address.intercom")}
            <input
              value={intercom}
              onChange={(event) => onChange({ intercom: event.target.value })}
              placeholder={t("address.intercomPh")}
              className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </label>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          {t("address.landmark")}
          <input
            value={landmark}
            onChange={(event) => onChange({ landmark: event.target.value })}
            placeholder={t("address.landmarkPh")}
            className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
          />
        </label>
      </div>
    </section>
  );
}
