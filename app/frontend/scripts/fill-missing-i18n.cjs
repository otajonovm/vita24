/* Fill keys present in uz.json but missing from ru.json / uz-Cyrl.json */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "../src/i18n/locales");
const uz = JSON.parse(fs.readFileSync(path.join(dir, "uz.json"), "utf8"));
const ru = JSON.parse(fs.readFileSync(path.join(dir, "ru.json"), "utf8"));
const cy = JSON.parse(fs.readFileSync(path.join(dir, "uz-Cyrl.json"), "utf8"));

function flatten(obj, p = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function setPath(obj, dotted, value) {
  // Prefer flat key if the locale already uses that style for this root segment
  if (Object.prototype.hasOwnProperty.call(obj, dotted)) {
    obj[dotted] = value;
    return;
  }
  const parts = dotted.split(".");
  // Flat-key roots used at top level in these locale files
  const flatRoots = new Set([
    "nav", "search", "empty", "lang", "orders", "panel", "order", "cart", "rx", "promo",
    "footer", "legal", "branch", "settings", "notifications",
  ]);
  // If first segment is a flat-style key already present as "a.b", keep flat
  if (flatRoots.has(parts[0]) && Object.keys(obj).some((k) => k.startsWith(`${parts[0]}.`))) {
    obj[dotted] = value;
    return;
  }
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cur[part] || typeof cur[part] !== "object" || Array.isArray(cur[part])) {
      cur[part] = {};
    }
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}

const RU = {
  "orders.active": "Активные",
  "orders.history": "История",
  "orders.tabEmpty": "В этом разделе заказов нет",
  "orders.moreItems": "и ещё {{count}}",
  "order.pay.cashPickup": "Наличные в филиале при самовывозе",
  "order.next.review": "Фармацевт проверит рецепт",
  "order.next.pay": "Оплатите заказ",
  "order.next.cashWait": "Наличные берутся при доставке",
  "order.next.paid": "Заказ принят",
  "order.next.preparing": "Сообщим, когда будет готово",
  "order.next.readyPickup": "Можно забрать в филиале",
  "order.next.readyDelivery": "Курьер скоро выедет",
  "order.next.delivering": "Курьер в пути",
  "order.next.label": "Следующий шаг",
  "order.pickupAddress": "Адрес самовывоза: {{place}}",
  "order.hours": "Часы работы",
  "order.phone": "Телефон",
  "order.reorderRx": "Повторный заказ с новым рецептом",
  "order.rejectReason": "Причина",
  "header.branchHint": "Наличие и самовывоз по этому филиалу",
  "promo.rxAction": "Загрузить рецепт",
  "home.allMedicines": "Все лекарства",
  "home.heroTitle": "Vita24 — онлайн-аптека. Оформите заказ: доставим или заберёте в филиале.",
  "home.heroSteps": "Найдите лекарство → Добавьте в корзину → Выберите доставку или самовывоз",
  "catalog.inStockOnly": "Только в наличии",
  "catalog.sort.popular": "По популярности",
  "medicine.packValue": "{{count}} {{unit}}",
  "medicine.unitPiece": "шт.",
  "medicine.unitCapsule": "капсула",
  "medicine.unitTablet": "таблетка",
  "medicine.low": "Мало осталось",
  "medicine.rxNote": "Фото рецепта загрузите в корзине — фармацевт проверит и подтвердит",
  "cart.checkout": "Оформление",
  "cart.uploadingRx": "Загрузка рецепта... ({{percent}}%)",
  "cart.creatingOrder": "Создание заказа...",
  "cart.stockChecking": "Проверяем остаток...",
  "cart.stockCheckFailed": "Не удалось проверить остаток",
  "cart.holdCashPickup": "Наличные в филиале при самовывозе",
  "cart.pickupFree": "Самовывоз — бесплатно",
  "cart.rxBadge": "Нужен рецепт",
  "cart.rxFor": "Рецепт для: {{names}}",
  "cart.lowStock": "Мало осталось",
  "cart.removed": "Удалено",
  "cart.undo": "Вернуть",
  "cart.clear": "Очистить корзину",
  "cart.clearConfirm": "Удалить все лекарства из корзины?",
  "cart.promoLogin": "Войдите, чтобы применить промокод",
  "address.aptPh": "Квартира (необязательно)",
  "address.entrance": "Подъезд",
  "address.entrancePh": "Подъезд",
  "address.floorPh": "Этаж",
  "address.landmark": "Ориентир",
  "address.landmarkPh": "Ориентир",
  "address.intercomPh": "Домофон (необязательно)",
  "address.mapCredit": "Карта: OpenStreetMap",
  "auth.phoneIncomplete": "Введите полный номер телефона",
  "auth.botTarget": "Код придёт в Telegram-бот @{{bot}}",
  "auth.botTargetPlain": "Код придёт в Telegram-бот",
  "auth.botStart": "Сначала откройте бота и нажмите /start",
  "auth.codeSentWait": "Код отправлен. Повторный запрос через 1 минуту",
  "profile.logoutConfirm": "Выйти из аккаунта?",
  "admin.basePriceHint": "Цена продажи берётся из Lekko по филиалу",
  "admin.thresholdTooltip": "Остаток ниже этого значения показывается как предупреждение",
  "admin.lekkoNeedKey": "Сначала введите ключ Lekko",
  "admin.twoFaBanner": "Для безопасности включите 2FA",
  "admin.auditStaffOnly": "Только действия сотрудников",
  "admin.branchHasStaff": "В филиале есть фармацевты: {{names}}. Сначала переведите их или отмените действие.",
  "admin.cancelOrder": "Отменить заказ",
  "admin.cancelRefundWarn": "Оплата прошла. При отмене будет создан возврат {{amount}}.",
  "admin.pharmacistNote": "Комментарий фармацевта",
  "admin.adminNote": "Комментарий админа",
  "admin.rxPlatformHint": "Очередь рецептов по платформе (только просмотр). Это не контроль фармацевта.",
  "admin.rxQueueCount": "В очереди",
  "admin.rxAvgWait": "Среднее ожидание",
  "admin.rxByBranch": "По филиалам",
  "admin.rxLongWaitSignal": "{{count}} заказ(ов) ждут долго — это сигнал платформы",
  "admin.dash.insufficientData": "Недостаточно данных",
};

const CY = {
  "orders.active": "Фаол",
  "orders.history": "Тарих",
  "orders.tabEmpty": "Бу бўлимда буюртма йўқ",
  "orders.moreItems": "ва яна {{count}} та",
  "order.pay.cashPickup": "Нақд пул филиалда, олиб кетаётганда тўланади",
  "order.next.review": "Фармацевт рецептни текширади",
  "order.next.pay": "Тўловни амалга оширинг",
  "order.next.cashWait": "Нақд пул етказилганда олинади",
  "order.next.paid": "Буюртма қабул қилинди",
  "order.next.preparing": "Тайёр бўлганда хабар берамиз",
  "order.next.readyPickup": "Филиалга келиб олишингиз мумкин",
  "order.next.readyDelivery": "Курьер тез орада йўлга чиқади",
  "order.next.delivering": "Курьер йўлда",
  "order.next.label": "Кейинги қадам",
  "order.pickupAddress": "Олиб кетиш манзили: {{place}}",
  "order.hours": "Иш вақти",
  "order.phone": "Телефон",
  "order.reorderRx": "Янги рецепт билан қайта буюртма",
  "order.rejectReason": "Сабаб",
  "header.branchHint": "Дори мавжудлиги ва олиб кетиш шу филиал бўйича",
  "promo.rxAction": "Рецепт юклаш",
  "home.allMedicines": "Барча дорилар",
  "home.heroTitle": "Vita24 — онлайн дорихона. Буюртма беринг, етказиб берамиз ёки филиалдан олиб кетинг.",
  "home.heroSteps": "Дорини топинг → Саватчага қўшинг → Етказиб бериш ёки олиб кетишни танланг",
  "catalog.inStockOnly": "Фақат мавжудлар",
  "catalog.sort.popular": "Машҳурлик",
  "medicine.packValue": "{{count}} {{unit}}",
  "medicine.unitPiece": "дона",
  "medicine.unitCapsule": "капсула",
  "medicine.unitTablet": "таблетка",
  "medicine.low": "Кам қолди",
  "medicine.rxNote": "Рецепт суратини саватчада юклайсиз — фармацевт текшириб тасдиқлайди",
  "cart.checkout": "Расмийлаштириш",
  "cart.uploadingRx": "Рецепт юкланмоқда... ({{percent}}%)",
  "cart.creatingOrder": "Буюртма яратилмоқда...",
  "cart.stockChecking": "Қолдиқ текширилмоқда...",
  "cart.stockCheckFailed": "Қолдиқни текшириб бўлмади",
  "cart.holdCashPickup": "Нақд пул филиалда, олиб кетаётганда тўланади",
  "cart.pickupFree": "Олиб кетиш — бепул",
  "cart.rxBadge": "Рецепт керак",
  "cart.rxFor": "Рецепт шу дорилар учун: {{names}}",
  "cart.lowStock": "Кам қолди",
  "cart.removed": "Ўчирилди",
  "cart.undo": "Қайтариш",
  "cart.clear": "Саватни тозалаш",
  "cart.clearConfirm": "Саватчадаги барча дорилар ўчирилсинми?",
  "cart.promoLogin": "Промокод ишлатиш учун тизимга киринг",
  "address.aptPh": "Квартира (ихтиёрий)",
  "address.entrance": "Подъезд",
  "address.entrancePh": "Подъезд",
  "address.floorPh": "Қават",
  "address.landmark": "Мўлжал",
  "address.landmarkPh": "Мўлжал",
  "address.intercomPh": "Домофон (ихтиёрий)",
  "address.mapCredit": "Харита: OpenStreetMap",
  "auth.phoneIncomplete": "Телефон рақамини тўлиқ киритинг",
  "auth.botTarget": "Код Telegram’dagi @{{bot}} ботига юборилади",
  "auth.botTargetPlain": "Код Telegram ботига юборилади",
  "auth.botStart": "Аввал ботни очинг ва /start босинг",
  "auth.codeSentWait": "Код юборилди. 1 дақиқадан сўнг қайта сўраш мумкин",
  "profile.logoutConfirm": "Тизимдан чиқасизми?",
  "admin.basePriceHint": "Сотув нархи филиал бўйича Lekko’dan олинади",
  "admin.thresholdTooltip": "Бу қийматдан кам қолдиқ огоҳлантириш сифатида кўрсатилади",
  "admin.lekkoNeedKey": "Аввал Lekko калитини киритинг",
  "admin.twoFaBanner": "Хавфсизлик учун 2FA’ни ёқинг",
  "admin.auditStaffOnly": "Фақат ходим амаллари",
  "admin.branchHasStaff": "Филиалда фармацевтлар бор: {{names}}. Аввал уларни бошқа филиалга ўтказинг ёки амални бекор қилинг.",
  "admin.cancelOrder": "Буюртмани бекор қилиш",
  "admin.cancelRefundWarn": "Тўлов қилинган. Бекор қилинса {{amount}} қайтариш яратилади.",
  "admin.pharmacistNote": "Фармацевт изоҳи",
  "admin.adminNote": "Админ изоҳи",
  "admin.rxPlatformHint": "Платформа бўйича рецепт навбати (фақат кўриш). Фармацевт назорати эмас.",
  "admin.rxQueueCount": "Навбатдаги",
  "admin.rxAvgWait": "Ўртача кутиш",
  "admin.rxByBranch": "Филиал бўйича",
  "admin.rxLongWaitSignal": "{{count}} та буюртма узоқ кутмоқда — бу платформа муаммоси",
  "admin.dash.insufficientData": "Маълумот етарли эмас",
};

const U = flatten(uz);
const missing = Object.keys(U).filter((k) => !(k in flatten(ru)));
const untranslated = missing.filter((k) => !RU[k]);
if (untranslated.length) {
  console.error("RU translations missing for:", untranslated.join(", "));
  process.exit(1);
}

for (const key of missing) {
  setPath(ru, key, RU[key]);
  setPath(cy, key, CY[key]);
}

fs.writeFileSync(path.join(dir, "ru.json"), `${JSON.stringify(ru, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "uz-Cyrl.json"), `${JSON.stringify(cy, null, 2)}\n`);

const stillRu = Object.keys(U).filter((k) => !(k in flatten(ru)));
const stillCy = Object.keys(U).filter((k) => !(k in flatten(cy)));
console.log(`filled ${missing.length} keys; remaining ru=${stillRu.length} cy=${stillCy.length}`);
