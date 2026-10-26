const RECENT_KEY = "vita24-recent-searches";
const CONTEXT_KEY = "vita24-search-context";

function readList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : [];
  } catch {
    return [];
  }
}

export function readRecentSearches() {
  return readList().slice(0, 5);
}

export function rememberSearch(query) {
  const value = String(query || "").trim();
  if (value.length < 2) return;
  const next = [value, ...readList().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ query: value, at: Date.now() }));
}

export function forgetRecentSearch(query) {
  const next = readList().filter((item) => item !== query);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export function readSearchContext() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || "null");
    if (!parsed?.query || Date.now() - Number(parsed.at || 0) > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}
