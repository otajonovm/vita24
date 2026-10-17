function trustProxyValue(raw = process.env.TRUST_PROXY) {
  const value = String(raw ?? "").trim();
  if (!value || value === "0" || value.toLowerCase() === "false") return false;
  if (value === "1" || value.toLowerCase() === "true") return 1;
  const hops = Number(value);
  if (Number.isInteger(hops) && hops > 0) return hops;
  return value;
}

function applyTrustProxy(app) {
  const setting = trustProxyValue();
  if (setting === false) return false;
  app.set("trust proxy", setting);
  return setting;
}

module.exports = {
  trustProxyValue,
  applyTrustProxy,
};
