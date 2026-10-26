const CODE_TTL_MS = 5 * 60 * 1000;
const SEARCH_TTL_MS = 5 * 60 * 1000;

const pendingCodes = new Map();
const expectedPhoneByChat = new Map();
const searchUntil = new Map();

function rememberPending(phone, code) {
  pendingCodes.set(phone, { code, expiresAt: Date.now() + CODE_TTL_MS });
}

function takePending(phone) {
  const row = pendingCodes.get(phone);
  if (!row || row.expiresAt <= Date.now()) {
    pendingCodes.delete(phone);
    return "";
  }
  pendingCodes.delete(phone);
  return row.code;
}

function setExpectedPhone(chatId, phone) {
  expectedPhoneByChat.set(String(chatId), phone);
}

function getExpectedPhone(chatId) {
  return expectedPhoneByChat.get(String(chatId)) || "";
}

function clearExpectedPhone(chatId) {
  expectedPhoneByChat.delete(String(chatId));
}

function enterSearchMode(chatId) {
  searchUntil.set(String(chatId), Date.now() + SEARCH_TTL_MS);
}

function inSearchMode(chatId) {
  const until = searchUntil.get(String(chatId));
  if (!until || until <= Date.now()) {
    searchUntil.delete(String(chatId));
    return false;
  }
  return true;
}

function clearSearchMode(chatId) {
  searchUntil.delete(String(chatId));
}

function resetPendingState() {
  pendingCodes.clear();
  expectedPhoneByChat.clear();
  searchUntil.clear();
}

module.exports = {
  CODE_TTL_MS,
  rememberPending,
  takePending,
  setExpectedPhone,
  getExpectedPhone,
  clearExpectedPhone,
  enterSearchMode,
  inSearchMode,
  clearSearchMode,
  resetPendingState,
};
