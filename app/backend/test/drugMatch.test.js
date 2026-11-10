const test = require("node:test");
const assert = require("node:assert/strict");
const {
  scoreMedicineAgainstRegistry,
  matchStatusForScore,
  pickBestMatch,
  normalizeForm,
  AUTO_MIN,
} = require("../src/lib/drugMatch");
const { resolveRegistryPrescriptionWrite, resolvePrescriptionWrite } = require("../src/lib/rxApply");
const { publicImageUrl } = require("../src/lib/medicineImage");
const { assertImageBuffer, pickPreferredImage } = require("../src/lib/mpaImageProcess");

test("azithromycin tablet high score → AUTO", () => {
  const score = scoreMedicineAgainstRegistry(
    {
      name: "азитромицин таб. 500мг №6",
      dosageForm: "таб.",
      dosage: "500мг",
      activeIngredient: "азитромицин",
      manufacturer: "JSC",
    },
    {
      shortName: "Азитромицин",
      fullName: "Азитромицин таблетки 500 мг №6",
      mnn: "Азитромицин",
      dosageForm: "таблетки",
      strength: "500 мг",
      manufacturer: "JSC",
      isPrescription: true,
    }
  );
  assert.ok(score >= AUTO_MIN, `score=${score}`);
  assert.equal(matchStatusForScore(score), "AUTO");
});

test("paracetamol tablet vs infusion form farq qiladi", () => {
  const tablet = scoreMedicineAgainstRegistry(
    { name: "Парацетамол таб. 500мг", dosageForm: "таб.", activeIngredient: "парацетамол" },
    { shortName: "Парацетамол", mnn: "Парацетамол", dosageForm: "таблетки", strength: "500 мг", isPrescription: false }
  );
  const infusion = scoreMedicineAgainstRegistry(
    { name: "Парацетамол инф. 10мг/мл", dosageForm: "инфузия", activeIngredient: "парацетамол" },
    { shortName: "Парацетамол", mnn: "Парацетамол", dosageForm: "раствор для инфузий", strength: "10 мг/мл", isPrescription: true }
  );
  assert.ok(tablet > 55);
  assert.ok(infusion > 55);
  assert.notEqual(normalizeForm("таб."), normalizeForm("инфузия"));
});

test("MPA topilmasa DEFAULT + review", () => {
  const decision = resolveRegistryPrescriptionWrite({
    existing: { rxSource: null, isPrescription: false },
    match: { matchStatus: "NONE", score: 10 },
    registryDrug: null,
    ruleClassified: { isPrescription: null },
  });
  assert.equal(decision.write, true);
  assert.equal(decision.isPrescription, true);
  assert.equal(decision.rxSource, "DEFAULT");
  assert.equal(decision.rxNeedsReview, true);
});

test("vitamin/BAD kategoriyada MPA topilmasa retseptsiz + review", () => {
  const decision = resolveRegistryPrescriptionWrite({
    existing: { rxSource: null, isPrescription: true },
    match: { matchStatus: "NONE", score: 10 },
    registryDrug: null,
    ruleClassified: { isPrescription: null },
    categorySlug: "vitaminlar-bad",
  });
  assert.equal(decision.write, true);
  assert.equal(decision.isPrescription, false);
  assert.equal(decision.rxSource, "DEFAULT");
  assert.equal(decision.rxNeedsReview, true);
  assert.equal(decision.reason, "unmatched-otc-lean");
});

test("MANUAL retsept hech qachon o'zgarmaydi", () => {
  const decision = resolveRegistryPrescriptionWrite({
    existing: { rxSource: "MANUAL", isPrescription: false },
    match: {
      matchStatus: "AUTO",
      candidate: { mpaId: "1", isPrescription: true },
    },
    registryDrug: { mpaId: "1", isPrescription: true },
  });
  assert.equal(decision.write, false);
  assert.equal(decision.kept, "MANUAL");
});

test("Lekko sinxron REGISTRY ni saqlaydi", () => {
  const decision = resolvePrescriptionWrite({
    existing: { rxSource: "REGISTRY", isPrescription: true },
    lekkoPrescription: false,
    fields: { name: "Test" },
  });
  assert.equal(decision.write, false);
  assert.equal(decision.kept, "REGISTRY");
});

test("PENDING REGISTRY rasm mijozga ko'rinmaydi", () => {
  assert.equal(
    publicImageUrl({ imageUrl: "/uploads/medicines/a.webp", imageSource: "REGISTRY", imageStatus: "PENDING" }),
    null
  );
  assert.equal(
    publicImageUrl({ imageUrl: "/uploads/medicines/a.webp", imageSource: "REGISTRY", imageStatus: "REJECTED" }),
    null
  );
  assert.equal(
    publicImageUrl({ imageUrl: "/uploads/medicines/a.webp", imageSource: "REGISTRY", imageStatus: "APPROVED" }),
    "/uploads/medicines/a.webp"
  );
  assert.equal(
    publicImageUrl({ imageUrl: "/uploads/medicines/b.webp", imageSource: "MANUAL", imageStatus: "APPROVED" }),
    "/uploads/medicines/b.webp"
  );
});

test("FRONT_SIDE afzal", () => {
  const pick = pickPreferredImage([
    { url: "back.jpg", side: "BACK_SIDE" },
    { url: "front.jpg", side: "FRONT_SIDE" },
  ]);
  assert.equal(pick.url, "front.jpg");
});

test("assertImageBuffer content-type tekshiradi", () => {
  assert.throws(() => assertImageBuffer(Buffer.from("x"), "text/html"));
  assert.doesNotThrow(() => assertImageBuffer(Buffer.alloc(3000, 1), "image/jpeg"));
});

test("metformin AUTO retseptli", () => {
  const best = pickBestMatch(
    { name: "метформин таб. 500мг №30", dosageForm: "таб.", activeIngredient: "метформин" },
    [
      {
        id: "1",
        shortName: "Метформин",
        fullName: "Метформин таблетки 500 мг №30",
        mnn: "Метформин",
        dosageForm: "таблетки",
        strength: "500 мг",
        isPrescription: true,
      },
    ]
  );
  assert.equal(best.matchStatus, "AUTO");
  const decision = resolveRegistryPrescriptionWrite({
    existing: { rxSource: null },
    match: best,
    registryDrug: best.candidate,
  });
  assert.equal(decision.rxSource, "REGISTRY");
  assert.equal(decision.isPrescription, true);
});
