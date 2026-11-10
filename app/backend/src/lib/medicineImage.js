/**
 * Mijozga ko‘rinadigan rasm:
 * MANUAL > APPROVED REGISTRY > (null → frontend shakl ikonkasi)
 * PENDING/REJECTED REGISTRY mijozga chiqmaydi.
 */

function isPublicMedicineImage(medicine) {
  if (!medicine?.imageUrl) return false;
  const source = medicine.imageSource || (medicine.imageUrl ? "MANUAL" : "NONE");
  if (source === "MANUAL") return true;
  if (source === "REGISTRY" && medicine.imageStatus === "APPROVED") return true;
  return false;
}

function publicImageUrl(medicine) {
  return isPublicMedicineImage(medicine) ? medicine.imageUrl || null : null;
}

function formIconKey(dosageForm) {
  const text = String(dosageForm || "").toLowerCase();
  if (/kaps|caps/.test(text)) return "capsule";
  if (/sirop|syrup/.test(text)) return "syrup";
  if (/inj|amp|инъек|ампул|раствор|r-r/.test(text)) return "injection";
  if (/infuz|infusion|flakon|флакон/.test(text)) return "infusion";
  if (/maz|ointment|krem|cream|gel|маз|крем|гель|malham/.test(text)) return "ointment";
  if (/sprey|spray|спрей/.test(text)) return "spray";
  if (/tomchi|drop|кап/.test(text)) return "drops";
  if (/porosh|powder|порош/.test(text)) return "powder";
  if (/supp|свеч|суппоз/.test(text)) return "suppository";
  if (/tab|таблет/.test(text)) return "tablet";
  return "tablet";
}

module.exports = {
  isPublicMedicineImage,
  publicImageUrl,
  formIconKey,
};
