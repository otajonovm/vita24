const { classifyMedicine } = require("../data/rxRules");

/**
 * Retsept ustuvorligi:
 *   MANUAL > REGISTRY > RULE / LEKKO > DEFAULT (standart)
 *
 * Sinxron (Lekko yoki MPA) rxSource=MANUAL qatorni hech qachon o'zgartirmaydi.
 * Lekko REGISTRY manbasini ham o'chirib yubormaydi.
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
  if (existing?.rxSource === "REGISTRY") {
    return { write: false, kept: "REGISTRY" };
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

/**
 * Asosan retseptsiz kategoriyalar (BAD, vitamin, krem, tibbiy buyum).
 * Bu yerda MPA topilmasa "xavfsiz tomon = retseptli" o'rniga OTC qoladi,
 * lekin rxNeedsReview=true — admin navbatida ko'rinadi.
 */
const OTC_LEAN_CATEGORY_SLUGS = new Set([
  "vitaminlar-bad",
  "teri-kremlar",
  "tibbiy-buyumlar",
]);

function isOtcLeanCategory(slugOrMedicine) {
  const slug = String(
    typeof slugOrMedicine === "string"
      ? slugOrMedicine
      : slugOrMedicine?.category?.slug || slugOrMedicine?.categorySlug || ""
  ).toLowerCase();
  return OTC_LEAN_CATEGORY_SLUGS.has(slug);
}

/**
 * MPA moslashuvi bo'yicha retsept qarori (rx:match).
 * MANUAL saqlanadi. Moslashgan → REGISTRY. Qoida → RULE.
 * Topilmasa → DEFAULT + rxNeedsReview.
 * Odatiy xavfsiz tomon: retseptli. Vitamin/BAD/krem/buyum: retseptsiz + review.
 */
function resolveRegistryPrescriptionWrite({ existing, match, registryDrug, ruleClassified, categorySlug }) {
  if (existing?.rxSource === "MANUAL") {
    return { write: false, kept: "MANUAL" };
  }

  const otcLean = isOtcLeanCategory(categorySlug || existing);

  if (match?.matchStatus === "AUTO" || match?.matchStatus === "CONFIRMED") {
    if (!registryDrug) {
      return {
        write: true,
        isPrescription: !otcLean,
        rxSource: "DEFAULT",
        rxNeedsReview: true,
        reason: otcLean ? "registry-missing-otc-lean" : "registry-missing",
      };
    }
    return {
      write: true,
      isPrescription: Boolean(registryDrug.isPrescription),
      rxSource: "REGISTRY",
      rxNeedsReview: false,
      reason: `registry:${registryDrug.mpaId}`,
    };
  }

  if (match?.matchStatus === "REVIEW") {
    // Ishonchsiz moslashuv: vitaminlarda badge yoqilmasin, lekin tekshiruvga tushsin.
    return {
      write: true,
      isPrescription: otcLean ? false : true,
      rxSource: "DEFAULT",
      rxNeedsReview: true,
      reason: otcLean ? "match-review-otc-lean" : "match-review",
    };
  }

  // NONE / REJECTED — qoidalar, aks holda DEFAULT
  if (ruleClassified?.isPrescription === true) {
    return {
      write: true,
      isPrescription: true,
      rxSource: "RULE",
      rxNeedsReview: false,
      reason: ruleClassified.reason,
    };
  }

  return {
    write: true,
    isPrescription: !otcLean,
    rxSource: "DEFAULT",
    rxNeedsReview: true,
    reason: otcLean ? "unmatched-otc-lean" : "unmatched-default",
  };
}

module.exports = {
  resolvePrescriptionWrite,
  prescriptionPatch,
  resolveRegistryPrescriptionWrite,
  isOtcLeanCategory,
  OTC_LEAN_CATEGORY_SLUGS,
};
