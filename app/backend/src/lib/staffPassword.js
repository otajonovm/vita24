const STAFF_PASSWORD_MESSAGE = "Parol kamida 8 belgi, harf va raqam bilan bo'lishi kerak";

function isStaffPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/.test(String(value || ""));
}

module.exports = {
  STAFF_PASSWORD_MESSAGE,
  isStaffPassword,
};
