const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "../../frontend/src/i18n/locales");
const fixes = {
  uz: {
    label: "Rad etish",
    notReceived: "Pul tushmagan",
    wrongAmount: "Summa noto'g'ri",
    unreadable: "Chek o'qilmaydi",
    other: "Boshqa",
  },
  "uz-Cyrl": {
    label: "Рад этиш",
    notReceived: "Пул тушмаган",
    wrongAmount: "Сумма нотўғри",
    unreadable: "Чек ўқилмайди",
    other: "Бошқа",
  },
  ru: {
    label: "Отклонить",
    notReceived: "Деньги не поступили",
    wrongAmount: "Неверная сумма",
    unreadable: "Чек нечитаем",
    other: "Другое",
  },
};

for (const [lang, text] of Object.entries(fixes)) {
  const file = path.join(dir, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.panel = data.panel || {};
  data.panel.receipt = data.panel.receipt || {};
  data.panel.receipt.reject = text.label;
  data.panel.receipt.rejectReasons = {
    notReceived: text.notReceived,
    wrongAmount: text.wrongAmount,
    unreadable: text.unreadable,
    other: text.other,
  };
  delete data.panel.receipt["reject.notReceived"];
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log("fixed", lang, typeof data.panel.receipt.reject);
}
