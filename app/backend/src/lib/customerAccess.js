const { AppError } = require("./response");

function customerBlockMessage(reason) {
  const text = String(reason || "").trim();
  return text
    ? `Hisobingiz bloklangan: ${text}`
    : "Hisobingiz bloklangan. Buyurtma berib bo'lmaydi";
}

function assertCustomerCanOrder(user) {
  if (!user || user.deletedAt) {
    throw new AppError("Foydalanuvchi topilmadi", 401, "UNAUTHORIZED");
  }
  if (user.status === "SUSPENDED") {
    throw new AppError(customerBlockMessage(user.blockReason), 403, "CUSTOMER_BLOCKED");
  }
  return user;
}

module.exports = {
  customerBlockMessage,
  assertCustomerCanOrder,
};
