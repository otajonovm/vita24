const { classifyMedicine } = require("../data/rxRules");

/**
 * Sinxron yozuvi.
 * MANUAL va avval LEKKO/RULE deb belgilangan qator o'zgarmaydi.
 * Lekko Rx yubormasa, hali belgilanmagan (rxSource yo'q) dori qoidalardan o'tadi.
 * Yangi qator ham qoidalardan o'tadi; qoida tegmasa isPrescription false.
 */
function ruleDecision(classified, isPrescription) {
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
    isPrescription: isPrescription === true,
    rxSource: null,
    rxNeedsReview: classified.rxNeedsReview === true,
    reason: classified.reason,
  };
}

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
  if (existing?.rxSource) {
    return { write: false, kept: "existing" };
  }
  const classified = classifyMedicine(fields || {});
  if (existing) {
    if (classified.isPrescription !== true && !classified.rxNeedsReview) {
      return { write: false, kept: "existing" };
    }
    if (classified.rxNeedsReview && existing.rxNeedsReview === true && classified.isPrescription !== true) {
      return { write: false, kept: "existing" };
    }
  }
  return ruleDecision(classified, false);
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
      activeIngredient: product?.activeIngredient || current?.activeIngredient || "",
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
