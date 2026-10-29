const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyMedicine } = require("../src/data/rxRules");
const { resolvePrescriptionWrite, prescriptionPatch } = require("../src/lib/rxApply");
const { mapProduct } = require("../src/services/lekkoService");
const { assertRxOrder } = require("../src/lib/rxOrder");

test("sinxron MANUAL true ni false qilmaydi", () => {
  const product = mapProduct({
    id: 1,
    name: "Амоксициллин",
    form: "таб.",
    dose: "500мг",
    isPrescription: false,
    rx: false,
  });
  const { patch, decision } = prescriptionPatch(product, {
    isPrescription: true,
    rxSource: "MANUAL",
  });
  assert.equal(decision.write, false);
  assert.equal(decision.kept, "MANUAL");
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "isPrescription"), false);
});

test("hali belgilanmagan Lekko dori qoidadan o'tadi", () => {
  const product = mapProduct({
    id: 3,
    name: "амоксициллин таб. 500мг №20",
    form: "таб.",
    dose: "500мг",
  });
  const { patch, decision } = prescriptionPatch(product, {
    isPrescription: false,
    rxSource: null,
    name: product.name,
    dosageForm: product.dosageForm,
  });
  assert.equal(decision.write, true);
  assert.equal(patch.isPrescription, true);
  assert.equal(patch.rxSource, "RULE");
});

test("Lekko Rx bermasa update mavjud qiymatni saqlaydi", () => {
  const product = mapProduct({
    id: 2,
    name: "Парацетамол",
    form: "таб.",
    atx: null,
    mnn: null,
  });
  assert.equal(product.isPrescription, undefined);
  const { patch, decision } = prescriptionPatch(product, {
    isPrescription: true,
    rxSource: "RULE",
    atcCode: null,
  });
  assert.equal(decision.write, false);
  assert.equal(decision.kept, "existing");
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "isPrescription"), false);
});

test("amoksitsillin retseptli, diazolin emas", () => {
  const rx = classifyMedicine({
    name: "амоксициллин таб. 500мг №20",
    dosageForm: "таб.",
    searchText: "",
    activeIngredient: "",
  });
  assert.equal(rx.isPrescription, true);
  assert.equal(rx.rxSource, "RULE");
  assert.match(rx.reason, /^inn:amoxicillin/);

  const otc = classifyMedicine({
    name: "Диазолин",
    dosageForm: "таб.",
    searchText: "диазолин",
    activeIngredient: "диазолин",
  });
  assert.equal(otc.isPrescription, null);
  assert.equal(otc.rxNeedsReview, false);

  const latin = classifyMedicine({ name: "Amoxicillin 500 mg", dosageForm: "tab." });
  assert.equal(latin.isPrescription, true);

  const syringe = classifyMedicine({
    name: "шприц инсулиновый 1мл №1",
    dosageForm: "Noma'lum",
    searchText: "shpris insulinov y 1ml 1",
  });
  assert.equal(syringe.isPrescription, null);
  const insulatard = classifyMedicine({ name: "инсулатард сусп. 100ед/1мл", dosageForm: "сусп." });
  assert.equal(insulatard.isPrescription, true);

  const predTab = classifyMedicine({ name: "преднизолон таб. 5мг №100", dosageForm: "Noma'lum" });
  assert.equal(predTab.isPrescription, null);
  const predAmp = classifyMedicine({ name: "преднизолон р-р 1мл №10", dosageForm: "Noma'lum" });
  assert.equal(predAmp.isPrescription, true);
  assert.match(predAmp.reason, /^inn:prednisolone/);
});

test("zaxiradan yaratilgan dori qoidadan o'tadi", () => {
  const created = resolvePrescriptionWrite({
    existing: null,
    lekkoPrescription: undefined,
    fields: { name: "Амоксициллин таб. 500мг №20", dosageForm: "Noma'lum" },
  });
  assert.equal(created.write, true);
  assert.equal(created.isPrescription, true);
  assert.equal(created.rxSource, "RULE");

  const plain = resolvePrescriptionWrite({
    existing: null,
    fields: { name: "Диазолин др. 50мг", dosageForm: "Noma'lum" },
  });
  assert.equal(plain.isPrescription, false);
  assert.equal(plain.rxSource, null);
});

test("inyeksiya shakli o'zi retsept qilmaydi, tekshirishga tushadi", () => {
  const review = classifyMedicine({
    name: "Натрия хлорид",
    dosageForm: "р-р для инъекций 0,9% амп.",
  });
  assert.equal(review.isPrescription, null);
  assert.equal(review.rxNeedsReview, true);

  const rxInjection = classifyMedicine({
    name: "Цефтриаксон",
    dosageForm: "пор. д/р-ра для инъекций",
  });
  assert.equal(rxInjection.isPrescription, true);
  assert.equal(rxInjection.rxNeedsReview, false);
});

test("ATC retseptli guruh", () => {
  const hit = classifyMedicine({ name: "Noma'lum dori", atcCode: "J01CA04" });
  assert.equal(hit.isPrescription, true);
  assert.match(hit.reason, /^atc:J01/);
  const miss = classifyMedicine({ name: "Парацетамол", atcCode: "N02BE01" });
  assert.equal(miss.isPrescription, null);
});

test("Lekko atx saqlanadi, taxminiy Rx maydoni o'qilmaydi", () => {
  const withAtc = mapProduct({ id: 9, name: "Test", form: "таб.", atx: "A10BA02" });
  assert.equal(withAtc.atcCode, "A10BA02");
  assert.equal(withAtc.isPrescription, undefined);
  const guessed = mapProduct({ id: 10, name: "Test", isPrescription: true, rx: true, recipeRequired: true });
  assert.equal(guessed.isPrescription, undefined);
});

test("Rx dori bor savatda retseptsiz buyurtma 400", () => {
  assert.throws(
    () => assertRxOrder([{ id: "m1", isPrescription: true }], ""),
    (error) => error.statusCode === 400 && error.code === "PRESCRIPTION_REQUIRED"
  );
  assert.equal(assertRxOrder([{ id: "m1", isPrescription: true }], "rx/file.jpg"), true);
  assert.equal(assertRxOrder([{ id: "m2", isPrescription: false }], ""), false);
});
