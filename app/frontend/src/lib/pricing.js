import deliveryFeeFile from "./deliveryFee.json";

export const DELIVERY_FEE = deliveryFeeFile.DELIVERY_FEE;
export const FREE_DELIVERY_FROM = deliveryFeeFile.FREE_DELIVERY_FROM;
export const DELIVERY_CITY = deliveryFeeFile.DELIVERY_CITY;
export const DELIVERY_ETA = deliveryFeeFile.DELIVERY_ETA;

export function quoteTotals(subtotal, options = {}) {
  const products = Math.round((Number(subtotal) || 0) * 100) / 100;
  const pickup = options.deliveryType === "PICKUP";
  const threshold = Number(options.freeFrom ?? FREE_DELIVERY_FROM);
  const fee = Number(options.deliveryFee ?? DELIVERY_FEE);
  const deliveryFee = pickup || products >= threshold ? 0 : fee;
  const discount = Math.min(products, Math.max(0, Math.round((Number(options.discount) || 0) * 100) / 100));
  const totalAmount = Math.max(0, Math.round((products + deliveryFee - discount) * 100) / 100);
  return { subtotal: products, deliveryFee, discount, totalAmount, freeFrom: threshold };
}
