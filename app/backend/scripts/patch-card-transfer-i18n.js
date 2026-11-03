const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "../../frontend/src/i18n/locales");

const patches = {
  uz: {
    common: { copy: "Nusxalash", copied: "Nusxalandi" },
    cart: {
      cardTransfer: "Kartaga o'tkazma",
      cardTransferHint: "Chek skrinshotini yuklaysiz, farmatsevt tasdiqlaydi",
    },
    order: {
      "pay.cardTransfer": "Kartaga o'tkazma",
      "pay.cardTransferPaid": "Kartaga o'tkazma tasdiqlandi",
      "status.receiptReview": "Chek tekshirilmoqda",
      receipt: {
        title: "Kartaga o'tkazma",
        step1: "Ko'rsatilgan kartaga o'tkazing",
        step2: "Chek skrinshotini yuklang",
        step3: "Farmatsevt tasdiqlashini kuting",
        cardNumber: "Karta raqami",
        holder: "Karta egasi",
        bank: "Bank",
        amount: "Summa",
        orderNo: "Buyurtma raqami",
        commentHint: "To'lov izohiga buyurtma raqamini yozing",
        upload: "Chekni yuklash",
        replace: "Almashtirish",
        reviewing: "Tekshirilmoqda",
        rejected: "Chek rad etildi",
        rejectOther: "Boshqa",
        uploaded: "Chek yuklandi",
        uploadFailed: "Chek yuklanmadi",
        failed: "Chek ochilmadi",
      },
    },
    panel: {
      "filters.paymentReview": "To'lov tekshiruvi",
      shiftCardTransfer: "Kartaga o'tkazma",
      receipt: {
        title: "To'lov cheki",
        uploadedAt: "Yuklangan vaqt",
        approve: "To'lov tushdi — tasdiqlash",
        reject: "Rad etish",
        approveConfirm: "Bankda {{amount}} tushganini tekshirdingizmi?",
        rejectConfirm: "Chekni rad etish sababini tanlang",
        approved: "To'lov tasdiqlandi",
        rejected: "Chek rad etildi",
        actionFailed: "Amal bajarilmadi",
        "reject.notReceived": "Pul tushmagan",
        "reject.wrongAmount": "Summa noto'g'ri",
        "reject.unreadable": "Chek o'qilmaydi",
        "reject.other": "Boshqa",
      },
    },
    admin: {
      settingsCardTransfer: "Kartaga o'tkazma",
      settingsCardTransferEnable: "Kartaga o'tkazmani yoqish",
      settingsCardTransferHint: "Payme/Click ulangandan keyin kartaga o'tkazmani o'chirishni tavsiya qilamiz",
      settingsCardNumber: "Karta raqami",
      settingsCardHolder: "Karta egasi",
      settingsCardBank: "Bank (ixtiyoriy)",
      settingsCardTimeout: "To'lov muddati (daqiqa)",
      pay: { CARD_TRANSFER: "Kartaga o'tkazma", CARD_TERMINAL: "Karta terminal" },
    },
  },
  "uz-Cyrl": {
    common: { copy: "Нусхалаш", copied: "Нусхаланди" },
    cart: {
      cardTransfer: "Картага ўтказма",
      cardTransferHint: "Чек скриншотини юклайсиз, фармацевт тасдиқлайди",
    },
    order: {
      "pay.cardTransfer": "Картага ўтказма",
      "pay.cardTransferPaid": "Картага ўтказма тасдиқланди",
      "status.receiptReview": "Чек текширилмоқда",
      receipt: {
        title: "Картага ўтказма",
        step1: "Кўрсатилган картага ўтказинг",
        step2: "Чек скриншотини юкланг",
        step3: "Фармацевт тасдиқлашини кутинг",
        cardNumber: "Карта рақами",
        holder: "Карта эгаси",
        bank: "Банк",
        amount: "Сумма",
        orderNo: "Буюртма рақами",
        commentHint: "Тўлов изоҳига буюртма рақамини ёзинг",
        upload: "Чекни юклаш",
        replace: "Алмаштириш",
        reviewing: "Текширилмоқда",
        rejected: "Чек рад этилди",
        rejectOther: "Бошқа",
        uploaded: "Чек юкланди",
        uploadFailed: "Чек юкланмади",
        failed: "Чек очилмади",
      },
    },
    panel: {
      "filters.paymentReview": "Тўлов текшируви",
      shiftCardTransfer: "Картага ўтказма",
      receipt: {
        title: "Тўлов чеки",
        uploadedAt: "Юкланган вақт",
        approve: "Тўлов тушди — тасдиқлаш",
        reject: "Рад этиш",
        approveConfirm: "Банкда {{amount}} тушганини текширдингизми?",
        rejectConfirm: "Чекни рад этиш сабабини танланг",
        approved: "Тўлов тасдиқланди",
        rejected: "Чек рад этилди",
        actionFailed: "Амал бажарилмади",
        "reject.notReceived": "Пул тушмаган",
        "reject.wrongAmount": "Сумма нотўғри",
        "reject.unreadable": "Чек ўқилмайди",
        "reject.other": "Бошқа",
      },
    },
    admin: {
      settingsCardTransfer: "Картага ўтказма",
      settingsCardTransferEnable: "Картага ўтказмани ёқиш",
      settingsCardTransferHint: "Payme/Click улангандан кейин картага ўтказмани ўчиришни тавсия қиламиз",
      settingsCardNumber: "Карта рақами",
      settingsCardHolder: "Карта эгаси",
      settingsCardBank: "Банк (ихтиёрий)",
      settingsCardTimeout: "Тўлов муддати (дақиқа)",
      pay: { CARD_TRANSFER: "Картага ўтказма", CARD_TERMINAL: "Карта терминал" },
    },
  },
  ru: {
    common: { copy: "Копировать", copied: "Скопировано" },
    cart: {
      cardTransfer: "Перевод на карту",
      cardTransferHint: "Загрузите скриншот чека, фармацевт подтвердит",
    },
    order: {
      "pay.cardTransfer": "Перевод на карту",
      "pay.cardTransferPaid": "Перевод на карту подтверждён",
      "status.receiptReview": "Чек на проверке",
      receipt: {
        title: "Перевод на карту",
        step1: "Переведите на указанную карту",
        step2: "Загрузите скриншот чека",
        step3: "Дождитесь подтверждения фармацевта",
        cardNumber: "Номер карты",
        holder: "Владелец карты",
        bank: "Банк",
        amount: "Сумма",
        orderNo: "Номер заказа",
        commentHint: "В комментарии к платежу укажите номер заказа",
        upload: "Загрузить чек",
        replace: "Заменить",
        reviewing: "На проверке",
        rejected: "Чек отклонён",
        rejectOther: "Другое",
        uploaded: "Чек загружен",
        uploadFailed: "Не удалось загрузить чек",
        failed: "Не удалось открыть чек",
      },
    },
    panel: {
      "filters.paymentReview": "Проверка оплаты",
      shiftCardTransfer: "Перевод на карту",
      receipt: {
        title: "Чек оплаты",
        uploadedAt: "Время загрузки",
        approve: "Оплата поступила — подтвердить",
        reject: "Отклонить",
        approveConfirm: "Вы проверили, что в банке поступило {{amount}}?",
        rejectConfirm: "Выберите причину отклонения чека",
        approved: "Оплата подтверждена",
        rejected: "Чек отклонён",
        actionFailed: "Не удалось выполнить действие",
        "reject.notReceived": "Деньги не поступили",
        "reject.wrongAmount": "Неверная сумма",
        "reject.unreadable": "Чек нечитаем",
        "reject.other": "Другое",
      },
    },
    admin: {
      settingsCardTransfer: "Перевод на карту",
      settingsCardTransferEnable: "Включить перевод на карту",
      settingsCardTransferHint: "После подключения Payme/Click рекомендуем отключить перевод на карту",
      settingsCardNumber: "Номер карты",
      settingsCardHolder: "Владелец карты",
      settingsCardBank: "Банк (необязательно)",
      settingsCardTimeout: "Срок оплаты (минуты)",
      pay: { CARD_TRANSFER: "Перевод на карту", CARD_TERMINAL: "Карточный терминал" },
    },
  },
};

function setPath(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key.includes(".")) {
      setPath(target, key, value);
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

for (const [lang, patch] of Object.entries(patches)) {
  const file = path.join(dir, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  deepMerge(data, patch);
  data["panel.filters.paymentReview"] = patch.panel["filters.paymentReview"];
  data["panel.shiftCardTransfer"] = patch.panel.shiftCardTransfer;
  data["order.pay.cardTransfer"] = patch.order["pay.cardTransfer"];
  data["order.pay.cardTransferPaid"] = patch.order["pay.cardTransferPaid"];
  data["order.status.receiptReview"] = patch.order["status.receiptReview"];
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log("patched", lang);
}
