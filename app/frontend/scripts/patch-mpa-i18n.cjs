const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "src", "i18n", "locales");
const packs = {
  uz: {
    medicineOtc: "Retseptsiz",
    navRegistry: "Retsept va rasm",
    registry: {
      title: "Retsept va rasm tekshiruvi",
      hint: "MPA moslashuvi va rasmlarni tasdiqlang. MANUAL retsept/rasm sinxron bilan o'zgarmaydi.",
      statRx: "Retseptli",
      statOtc: "Retseptsiz",
      statReview: "Tekshirish kerak",
      statUnmatched: "Moslashmagan",
      statNoImage: "Rasmsiz",
      statPending: "Rasm tasdiq kutmoqda",
      tabMatches: "Moslashuvni tekshirish",
      tabImages: "Rasmni tekshirish",
      search: "Qidirish",
      selected: "{{count}} ta tanlandi",
      bulkApprove: "Tanlanganlarni tasdiqlash",
      bulkReject: "Tanlanganlarni rad etish",
      selectRow: "Qatorni tanlash",
      rxYes: "Retseptli",
      rxNo: "Retseptsiz",
      needsReview: "Tekshirish kerak",
      mpaCandidate: "MPA nomzodi",
      score: "Ball",
      noCandidate: "MPA nomzodi yo'q",
      confirm: "Tasdiqlash",
      pickOther: "Boshqasini tanlash",
      reject: "Rad etish",
      markOtc: "Retseptsiz qilish",
      markRx: "Retseptli qilish",
      noImage: "Rasm yo'q",
      approveImage: "Rasmni tasdiqlash",
      rejectImage: "Rasmni rad etish",
      otherSide: "Boshqa tomon",
      pickTitle: "MPA yozuvini tanlang",
      noLocalHits: "Mahalliy reyestrda topilmadi",
      actionFailed: "Amal bajarilmadi",
    },
    panelNeedsImage: "Rasm almashtirish",
    panelRegistryImage: "MPA rasmi",
    panelNoImage: "Rasmsiz / ikonka",
    panelUploadImage: "Rasm yuklash",
    panelRegistryHint: "MPA rasmi — o'zingiznikiga almashtiring",
    panelIconHint: "Hali ikonka / rasmsiz",
  },
  "uz-Cyrl": {
    medicineOtc: "Рецептсиз",
    navRegistry: "Рецепт ва расм",
    registry: {
      title: "Рецепт ва расм текшируви",
      hint: "MPA мослашуви ва расмларни тасдиқланг. MANUAL рецепт/расм синхрон билан ўзгармайди.",
      statRx: "Рецептли",
      statOtc: "Рецептсиз",
      statReview: "Текшириш керак",
      statUnmatched: "Мослашмаган",
      statNoImage: "Расмсиз",
      statPending: "Расм тасдиқ кутмоқда",
      tabMatches: "Мослашувни текшириш",
      tabImages: "Расмни текшириш",
      search: "Қидириш",
      selected: "{{count}} та танланди",
      bulkApprove: "Танланганларни тасдиқлаш",
      bulkReject: "Танланганларни рад этиш",
      selectRow: "Қаторни танлаш",
      rxYes: "Рецептли",
      rxNo: "Рецептсиз",
      needsReview: "Текшириш керак",
      mpaCandidate: "MPA номзоди",
      score: "Балл",
      noCandidate: "MPA номзоди йўқ",
      confirm: "Тасдиқлаш",
      pickOther: "Бошқасини танлаш",
      reject: "Рад этиш",
      markOtc: "Рецептсиз қилиш",
      markRx: "Рецептли қилиш",
      noImage: "Расм йўқ",
      approveImage: "Расмни тасдиқлаш",
      rejectImage: "Расмни рад этиш",
      otherSide: "Бошқа томон",
      pickTitle: "MPA ёзувини танланг",
      noLocalHits: "Маҳаллий реестрда топилмади",
      actionFailed: "Амал бажарилмади",
    },
    panelNeedsImage: "Расм алмаштириш",
    panelRegistryImage: "MPA расми",
    panelNoImage: "Расмсиз / иконка",
    panelUploadImage: "Расм юклаш",
    panelRegistryHint: "MPA расми — ўзингизникига алмаштиринг",
    panelIconHint: "Ҳали иконка / расмсиз",
  },
  ru: {
    medicineOtc: "Без рецепта",
    navRegistry: "Рецепт и фото",
    registry: {
      title: "Проверка рецепта и фото",
      hint: "Подтверждайте сопоставление MPA и фото. MANUAL рецепт/фото синхронизация не меняет.",
      statRx: "По рецепту",
      statOtc: "Без рецепта",
      statReview: "Нужна проверка",
      statUnmatched: "Без совпадения",
      statNoImage: "Без фото",
      statPending: "Фото ждёт одобрения",
      tabMatches: "Проверка сопоставления",
      tabImages: "Проверка фото",
      search: "Поиск",
      selected: "Выбрано: {{count}}",
      bulkApprove: "Одобрить выбранные",
      bulkReject: "Отклонить выбранные",
      selectRow: "Выбрать строку",
      rxYes: "По рецепту",
      rxNo: "Без рецепта",
      needsReview: "Нужна проверка",
      mpaCandidate: "Кандидат MPA",
      score: "Балл",
      noCandidate: "Нет кандидата MPA",
      confirm: "Подтвердить",
      pickOther: "Выбрать другой",
      reject: "Отклонить",
      markOtc: "Сделать без рецепта",
      markRx: "Сделать по рецепту",
      noImage: "Нет фото",
      approveImage: "Одобрить фото",
      rejectImage: "Отклонить фото",
      otherSide: "Другая сторона",
      pickTitle: "Выберите запись MPA",
      noLocalHits: "В локальном реестре не найдено",
      actionFailed: "Действие не выполнено",
    },
    panelNeedsImage: "Заменить фото",
    panelRegistryImage: "Фото MPA",
    panelNoImage: "Без фото / иконка",
    panelUploadImage: "Загрузить фото",
    panelRegistryHint: "Фото MPA — замените своим",
    panelIconHint: "Пока иконка / без фото",
  },
};

for (const [locale, pack] of Object.entries(packs)) {
  const file = path.join(root, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.medicine = data.medicine || {};
  data.medicine.otcBadge = pack.medicineOtc;
  data.admin = data.admin || {};
  data.admin.nav = data.admin.nav || {};
  data.admin.nav.registry = pack.navRegistry;
  data.admin.registry = pack.registry;
  data.panel = data.panel || {};
  data.panel.filters = data.panel.filters || {};
  data.panel.filters.needsImage = pack.panelNeedsImage;
  data.panel.filters.registryImage = pack.panelRegistryImage;
  data.panel.filters.noImage = pack.panelNoImage;
  data.panel.uploadImage = pack.panelUploadImage;
  data.panel.registryImageHint = pack.panelRegistryHint;
  data.panel.iconImageHint = pack.panelIconHint;
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log("updated", locale);
}
