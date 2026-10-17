export function displayName(raw) {
  const name = String(raw || "").trim();
  if (!name || name === "Mijoz") return "";
  return name;
}
