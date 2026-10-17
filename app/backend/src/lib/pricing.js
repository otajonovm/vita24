const { DELIVERY_FEE, FREE_DELIVERY_FROM } = require("./deliveryFee.json");

function quoteTotals(subtotal, options = {}) {
  const products = Math.round((Number(subtotal) || 0) * 100) / 100;
  const pickup = options.deliveryType === "PICKUP";
  const threshold = Number(options.freeFrom ?? FREE_DELIVERY_FROM);
  const fee = Number(options.deliveryFee ?? DELIVERY_FEE);
  const deliveryFee = pickup || products >= threshold ? 0 : fee;
  const discount = Math.min(products, Math.max(0, Math.round((Number(options.discount) || 0) * 100) / 100));
  const totalAmount = Math.max(0, Math.round((products + deliveryFee - discount) * 100) / 100);
  return { subtotal: products, deliveryFee, discount, totalAmount };
}

function settledTotals(order) {
  const subtotal = Math.round((Number(order?.subtotal) || 0) * 100) / 100;
  if (order && order.deliveryFee != null && order.deliveryFee !== "") {
    const deliveryFee = Number(order.deliveryFee);
    const discount = Number(order.discount || 0);
    return {
      subtotal,
      deliveryFee,
      discount,
      totalAmount: Math.max(0, Math.round((subtotal + deliveryFee - discount) * 100) / 100),
    };
  }
  return quoteTotals(subtotal, { deliveryType: order?.deliveryType });
}

function payableAmount(subtotal, options) {
  return quoteTotals(subtotal, options).totalAmount;
}

module.exports = {
  DELIVERY_FEE,
  FREE_DELIVERY_FROM,
  quoteTotals,
  settledTotals,
  payableAmount,
};
