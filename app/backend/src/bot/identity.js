let liveUsername = "";

function setBotUsername(name) {
  liveUsername = String(name || "")
    .replace(/^@/, "")
    .trim();
}

function currentBotUsername() {
  return (
    liveUsername ||
    String(process.env.TELEGRAM_BOT_USERNAME || "")
      .replace(/^@/, "")
      .trim()
  );
}

function botUrl() {
  const name = currentBotUsername();
  return name ? `https://t.me/${name}` : "";
}

function startLinkFor(phone) {
  const name = currentBotUsername();
  if (!name) return "";
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://t.me/${name}?start=${digits}` : `https://t.me/${name}`;
}

function webAppUrl() {
  const raw = String(process.env.WEBAPP_URL || "").trim();
  if (raw.startsWith("https://")) return raw.replace(/\/$/, "");
  return "";
}

function publicSiteUrl() {
  const https = webAppUrl();
  if (https) return https;
  return String(process.env.PUBLIC_SITE_URL || process.env.CLIENT_ORIGIN || "")
    .trim()
    .replace(/\/$/, "");
}

module.exports = {
  setBotUsername,
  currentBotUsername,
  botUrl,
  startLinkFor,
  webAppUrl,
  publicSiteUrl,
};
