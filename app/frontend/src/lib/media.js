function resolveApiOrigin() {
  const explicit = String(import.meta.env.VITE_API_ORIGIN || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const apiUrl = String(import.meta.env.VITE_API_URL || "/api").trim();
  if (apiUrl.startsWith("http://") || apiUrl.startsWith("https://")) {
    return apiUrl.replace(/\/api\/?$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost:5000";
}

const API_ORIGIN = resolveApiOrigin();

export function resolveMediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  if (raw.startsWith("/")) {
    return `${API_ORIGIN}${raw}`;
  }
  return `${API_ORIGIN}/${raw}`;
}
