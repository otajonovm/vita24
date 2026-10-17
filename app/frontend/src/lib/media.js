const API_ORIGIN = "http://localhost:5000";

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
