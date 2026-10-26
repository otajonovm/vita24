const { AppError } = require("./response");

function assertRxOrder(medicines, prescriptionFileKey) {
  const hasRxItems = (medicines || []).some((medicine) => medicine.isPrescription);
  if (hasRxItems && !prescriptionFileKey) {
    throw new AppError(
      "Retseptli dorilar uchun retsept yuklash majburiy",
      400,
      "PRESCRIPTION_REQUIRED"
    );
  }
  return hasRxItems;
}

module.exports = { assertRxOrder };
