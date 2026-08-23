import { useEffect, useRef, useState } from "react";
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
  lat,
  lng,
  onChange,
}) {
  const skipSuggestRef = useRef(Boolean(street));
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

  const applyPlace = (place) => {
    if (!place?.lat || !place?.lng) return;
    skipSuggestRef.current = true;
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
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return undefined;
    }
    const needle = street.trim();
    if (needle.length < 3) {
      setSuggestions([]);
      setOpenSuggest(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const rows = await searchPlaces(needle, center);
        setSuggestions(rows);
        setOpenSuggest(rows.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [street]);

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
      setStatus(error.message || "Joylashuv aniqlanmadi");
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

  const handleEnter = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (suggestions[0]) {
      handlePick(suggestions[0]);
      return;
    }
    const place = await geocodePlace(street);
    if (place) applyPlace(place);
    else setStatus("Manzil topilmadi");
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="relative h-40 overflow-hidden bg-slate-100 md:h-56 lg:h-72">
        <iframe
          key={`${center.lat.toFixed(5)}-${center.lng.toFixed(5)}`}
          title="Yetkazib berish xaritasi"
          src={mapSrc(center.lat, center.lng)}
          className="h-full w-full border-0"
          loading="lazy"
        />
      </div>

      <div className="grid gap-3 p-3">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Yetkazish manzili
          <span className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              required
              value={street}
              onChange={(event) => onChange({ street: event.target.value })}
              onFocus={() => suggestions.length > 0 && setOpenSuggest(true)}
              onBlur={() => setTimeout(() => setOpenSuggest(false), 180)}
              onKeyDown={handleEnter}
              placeholder="Manzilni yozing yoki GPS ni bosing"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-14 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
            />
            <button
              type="button"
              onClick={handleLocate}
              disabled={locating}
              aria-label="Mening joyim"
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
            GPS aniqlanmoqda{accuracy ? ` (${accuracy} m)` : ""}...
          </p>
        )}
        {status && <p className="text-xs text-red-600">{status}</p>}

        <div className="grid grid-cols-3 gap-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Kvartira
            <input
              value={apartment}
              onChange={(event) => onChange({ apartment: event.target.value })}
              placeholder="12"
              className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Qavat
            <input
              value={floor}
              onChange={(event) => onChange({ floor: event.target.value })}
              placeholder="4"
              className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Domofon
            <input
              value={intercom}
              onChange={(event) => onChange({ intercom: event.target.value })}
              placeholder="12K"
              className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none ring-brand/30 focus:ring-2"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
