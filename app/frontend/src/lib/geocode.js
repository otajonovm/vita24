function titleFromParts(parts) {
  return [...new Set(parts.filter(Boolean))].join(", ");
}

function formatPhoton(feature) {
  const [lng, lat] = feature.geometry?.coordinates || [];
  const props = feature.properties || {};
  return {
    title: titleFromParts([
      [props.street, props.housenumber].filter(Boolean).join(" "),
      props.name,
      props.city || props.town || props.village || props.district,
    ]),
    city: props.city || props.town || props.village || props.state || "",
    lat: Number(lat),
    lng: Number(lng),
  };
}

function formatNominatim(item) {
  return {
    title: item.display_name,
    city: item.address?.city || item.address?.town || item.address?.state || "",
    lat: Number(item.lat),
    lng: Number(item.lon),
  };
}

function formatMeteo(item) {
  return {
    title: titleFromParts([item.name, item.admin2, item.admin1]),
    city: item.admin1 || item.admin2 || "",
    lat: item.latitude,
    lng: item.longitude,
  };
}

function uniquePlaces(places) {
  const seen = new Set();
  return places.filter((place) => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng) || !place.title) return false;
    const key = `${place.title}-${place.lat.toFixed(4)}-${place.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchPhoton(query) {
  const params = new URLSearchParams({
    q: query,
    limit: "6",
    lang: "en",
    lat: "41.31",
    lon: "69.28",
  });
  const response = await fetch(`https://photon.komoot.io/api/?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.features || []).map(formatPhoton);
}

async function searchMeteo(query) {
  const params = new URLSearchParams({
    name: query,
    count: "6",
    language: "uz",
    format: "json",
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results || []).map(formatMeteo);
}

async function searchNominatim(query) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    limit: "6",
    "accept-language": "uz",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data.map(formatNominatim) : [];
}

export async function searchPlaces(query, bias, city = "Toshkent") {
  const needle = query.trim();
  if (needle.length < 2) return [];
  const scoped = `${needle}, ${city}`;

  const results = await Promise.allSettled([
    searchPhoton(scoped),
    searchMeteo(scoped),
    searchNominatim(scoped),
  ]);

  return keepDeliveryPlaces(
    results.flatMap((item) => (item.status === "fulfilled" ? item.value : [])),
    city
  ).slice(0, 8);
}

export async function geocodePlace(query) {
  const rows = await searchPlaces(query);
  return rows[0] || null;
}

export async function reverseGeocode(lat, lng) {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      "accept-language": "uz",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (response.ok) {
      const data = await response.json();
      if (data.display_name) return data.display_name;
    }
  } catch {
    /* BigDataCloud fallback */
  }

  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      localityLanguage: "uz",
    });
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`
    );
    if (response.ok) {
      const data = await response.json();
      return (
        data.formattedAddress ||
        titleFromParts([data.locality, data.city, data.principalSubdivision, data.countryName])
      );
    }
  } catch {
    /* coords fallback */
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

const UZ_BOUNDS = { minLat: 37.1, maxLat: 45.7, minLng: 55.9, maxLng: 73.3 };
const DELIVERY_ZONE = { minLat: 41.18, maxLat: 41.42, minLng: 69.1, maxLng: 69.48 };
const CITY_MARKS = ["toshkent", "tashkent", "тошкент", "ташкент"];

function geoFail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function inDeliveryZone(lat, lng) {
  return lat >= DELIVERY_ZONE.minLat && lat <= DELIVERY_ZONE.maxLat && lng >= DELIVERY_ZONE.minLng && lng <= DELIVERY_ZONE.maxLng;
}

function matchesCity(place, city) {
  const haystack = `${place.title} ${place.city || ""}`.toLowerCase();
  const marks = CITY_MARKS.concat(String(city || "").trim().toLowerCase()).filter(Boolean);
  return marks.some((mark) => haystack.includes(mark));
}

function keepDeliveryPlaces(places, city) {
  return uniquePlaces(places).filter((place) => inDeliveryZone(place.lat, place.lng) && matchesCity(place, city));
}

async function readGeoPermission() {
  if (!navigator.permissions?.query) return { state: "unknown", watch() { return () => {}; } };
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return {
      state: status.state,
      watch(onChange) {
        const handler = () => onChange(status.state);
        status.addEventListener("change", handler);
        return () => status.removeEventListener("change", handler);
      },
    };
  } catch {
    return { state: "unknown", watch() { return () => {}; } };
  }
}

function inUzbekistan(lat, lng) {
  return lat >= UZ_BOUNDS.minLat && lat <= UZ_BOUNDS.maxLat && lng >= UZ_BOUNDS.minLng && lng <= UZ_BOUNDS.maxLng;
}

export async function getAccurateLocation(onProgress) {
  if (!navigator.geolocation) {
    throw geoFail("UNSUPPORTED", "Brauzer geolokatsiyani qo'llab-quvvatlamaydi");
  }
  const permission = await readGeoPermission();
  if (permission.state === "denied") {
    throw geoFail("DENIED", "Joylashuvga ruxsat berilmadi. Brauzer so'rovida Ruxsat ni bosing.");
  }

  return new Promise((resolve, reject) => {
    let best = null;
    let done = false;
    let watchId = 0;
    let timer = 0;
    let stopWatch = () => {};

    const finish = (callback) => {
      if (done) return;
      done = true;
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      stopWatch();
      callback();
    };
    const arm = () => {
      if (timer || done) return;
      timer = setTimeout(() => {
        finish(() => {
          if (best) resolve(best);
          else reject(geoFail("TIMEOUT", "Joylashuvni aniqlash vaqti tugadi. Manzilni qo'lda yozing."));
        });
      }, 9000);
    };

    if (permission.state === "granted") arm();
    else stopWatch = permission.watch((state) => {
      if (state === "granted") arm();
      if (state === "denied") finish(() => reject(geoFail("DENIED", "Joylashuvga ruxsat berilmadi. Brauzer so'rovida Ruxsat ni bosing.")));
    });

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const reading = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy || 9999,
        };
        if (!inUzbekistan(reading.lat, reading.lng)) return;
        if (!best || reading.accuracy < best.accuracy) {
          best = reading;
          onProgress?.(reading);
        }
        if (reading.accuracy <= 25) finish(() => resolve(best));
      },
      (error) => {
        if (best) {
          finish(() => resolve(best));
          return;
        }
        if (error.code === 1) {
          finish(() => reject(geoFail("DENIED", "Joylashuvga ruxsat berilmadi. Brauzer so'rovida Ruxsat ni bosing.")));
          return;
        }
        if (error.code === 3 && permission.state !== "granted" && !timer) return;
        finish(() => reject(geoFail(error.code === 3 ? "TIMEOUT" : "UNAVAILABLE", error.code === 3
          ? "Joylashuvni aniqlash vaqti tugadi. Manzilni qo'lda yozing."
          : "Joylashuv aniqlanmadi. GPS yoki Wi-Fi ni yoqing.")));
      },
      { enableHighAccuracy: true, timeout: permission.state === "granted" ? 25000 : 120000, maximumAge: 0 }
    );
  });
}

export function getBrowserLocation() {
  return getAccurateLocation();
}

export function haversineKm(from, to) {
  const lat1 = Number(from?.lat);
  const lng1 = Number(from?.lng);
  const lat2 = Number(to?.lat);
  const lng2 = Number(to?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.max(50, Math.round(km * 1000))} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function branchCoords(branch) {
  const lat = Number(branch?.latitude ?? branch?.lat);
  const lng = Number(branch?.longitude ?? branch?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function nearestBranch(branches, origin) {
  if (!origin || !Array.isArray(branches) || branches.length === 0) return null;

  return branches.reduce((best, branch) => {
    const coords = branchCoords(branch);
    if (!coords) return best;
    const distanceKm = haversineKm(origin, coords);
    if (!best || distanceKm < best.distanceKm) {
      return { branch, distanceKm };
    }
    return best;
  }, null);
}

export async function getCurrentLocation() {
  if (!navigator.geolocation) {
    throw geoFail("UNSUPPORTED", "Brauzer geolokatsiyani qo'llab-quvvatlamaydi");
  }
  const permission = await readGeoPermission();
  if (permission.state === "denied") {
    throw geoFail("DENIED", "Joylashuvga ruxsat berilmadi. Brauzer so'rovida Ruxsat ni bosing.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    let stopWatch = () => {};
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      stopWatch();
      callback();
    };
    const arm = () => {
      if (timer || settled) return;
      timer = setTimeout(() => {
        finish(() => reject(geoFail("TIMEOUT", "Joylashuvni aniqlash vaqti tugadi. Filialni qo'lda tanlang.")));
      }, 8000);
    };

    if (permission.state === "granted") arm();
    else stopWatch = permission.watch((state) => {
      if (state === "granted") arm();
      if (state === "denied") finish(() => reject(geoFail("DENIED", "Joylashuvga ruxsat berilmadi. Brauzer so'rovida Ruxsat ni bosing.")));
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (!inUzbekistan(lat, lng)) {
          finish(() => reject(geoFail("OUTSIDE", "Joylashuv O'zbekiston tashqarisida. Filialni qo'lda tanlang.")));
          return;
        }
        finish(() => resolve({ lat, lng, accuracy: position.coords.accuracy || 9999 }));
      },
      (error) => {
        if (error.code === 1) {
          finish(() => reject(geoFail("DENIED", "Joylashuvga ruxsat berilmadi. Brauzer so'rovida Ruxsat ni bosing.")));
          return;
        }
        if (error.code === 3 && permission.state !== "granted" && !timer) return;
        finish(() => reject(geoFail(
          error.code === 3 ? "TIMEOUT" : "UNAVAILABLE",
          error.code === 3
            ? "Joylashuvni aniqlash vaqti tugadi. Filialni qo'lda tanlang."
            : "Joylashuv aniqlanmadi. GPS yoki Wi-Fi ni yoqing."
        )));
      },
      { enableHighAccuracy: true, timeout: permission.state === "granted" ? 8000 : 120000, maximumAge: 60_000 }
    );
  });
}
