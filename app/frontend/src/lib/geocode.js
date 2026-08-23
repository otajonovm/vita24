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
      props.county || props.state,
      props.country,
    ]),
    lat: Number(lat),
    lng: Number(lng),
  };
}

function formatNominatim(item) {
  return {
    title: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
  };
}

function formatMeteo(item) {
  return {
    title: titleFromParts([item.name, item.admin2, item.admin1, item.country]),
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

export async function searchPlaces(query, bias) {
  const needle = query.trim();
  if (needle.length < 2) return [];

  if (Number.isFinite(bias?.lat) && Number.isFinite(bias?.lng)) {
    const params = new URLSearchParams({
      q: needle,
      limit: "6",
      lang: "en",
      lat: String(bias.lat),
      lon: String(bias.lng),
    });
    try {
      const response = await fetch(`https://photon.komoot.io/api/?${params}`);
      if (response.ok) {
        const data = await response.json();
        const local = uniquePlaces((data.features || []).map(formatPhoton));
        if (local.length) return local.slice(0, 8);
      }
    } catch {
      /* global fallback */
    }
  }

  const results = await Promise.allSettled([
    searchPhoton(needle),
    searchMeteo(needle),
    searchNominatim(`${needle}, Uzbekistan`),
  ]);

  return uniquePlaces(results.flatMap((item) => (item.status === "fulfilled" ? item.value : []))).slice(
    0,
    8
  );
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

function inUzbekistan(lat, lng) {
  return lat >= UZ_BOUNDS.minLat && lat <= UZ_BOUNDS.maxLat && lng >= UZ_BOUNDS.minLng && lng <= UZ_BOUNDS.maxLng;
}

export function getAccurateLocation(onProgress) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Brauzer geolokatsiyani qo'llab-quvvatlamaydi"));
      return;
    }

    let best = null;
    let done = false;
    let watchId = 0;
    let timer = 0;

    const finish = () => {
      if (done) return;
      done = true;
      if (watchId) navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      if (!best) {
        reject(new Error("Joylashuv aniqlanmadi. GPS ni yoqing yoki manzilni yozing."));
        return;
      }
      resolve(best);
    };

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
        if (reading.accuracy <= 25) finish();
      },
      (error) => {
        if (best) {
          finish();
          return;
        }
        const messages = {
          1: "Joylashuvga ruxsat berilmadi. Brauzer so'rovida Ruxsat ni bosing.",
          2: "Joylashuv aniqlanmadi. GPS yoki Wi-Fi ni yoqing.",
          3: "Joylashuvni aniqlash vaqti tugadi. Manzilni qo'lda yozing.",
        };
        done = true;
        if (watchId) navigator.geolocation.clearWatch(watchId);
        if (timer) clearTimeout(timer);
        reject(new Error(messages[error.code] || "Joylashuv olinmadi"));
      },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
    );

    timer = setTimeout(finish, 9000);
  });
}

export function getBrowserLocation() {
  return getAccurateLocation();
}
