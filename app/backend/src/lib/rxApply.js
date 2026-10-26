const { classifyMedicine } = require("../data/rxRules");

/**
 * Sinxron yozuvi.
 * MANUAL hech qachon o'zgarmaydi.
 * Lekko haqiqiy boolean bermasa, mavjud qator o'z qiymatini saqlaydi.
 * Yangi qator qoidalardan o'tadi; qoida tegmasa isPrescription false.
 */
function resolvePrescriptionWrite({ existing, lekkoPrescription, fields }) {
  if (existing?.rxSource === "MANUAL") {
    return { write: false, kept: "MANUAL" };
  }
  if (typeof lekkoPrescription === "boolean") {
    return {
      write: true,
      isPrescription: lekkoPrescription,
      rxSource: "LEKKO",
      rxNeedsReview: false,
      reason: "lekko",
    };
  }
  if (existing) {
    return { write: false, kept: "existing" };
  }
  const classified = classifyMedicine(fields || {});
  if (classified.isPrescription === true) {
    return {
      write: true,
      isPrescription: true,
      rxSource: "RULE",
      rxNeedsReview: false,
      reason: classified.reason,
    };
  }
  return {
    write: true,
    isPrescription: false,
    rxSource: null,
    rxNeedsReview: classified.rxNeedsReview === true,
    reason: classified.reason,
  };
}

function prescriptionPatch(product, current) {
  const patch = {};
  if (product?.atcCode) patch.atcCode = product.atcCode;
  const decision = resolvePrescriptionWrite({
    existing: current,
    lekkoPrescription: typeof product?.isPrescription === "boolean" ? product.isPrescription : undefined,
    fields: {
      name: product?.name,
      searchText: current?.searchText || "",
      activeIngredient: current?.activeIngredient || "",
      dosageForm: product?.dosageForm,
      atcCode: product?.atcCode || current?.atcCode || "",
    },
  });
  if (!decision.write) return { patch, decision };
  patch.isPrescription = decision.isPrescription;
  patch.rxSource = decision.rxSource;
  patch.rxNeedsReview = decision.rxNeedsReview;
  return { patch, decision };
}

module.exports = { resolvePrescriptionWrite, prescriptionPatch };
