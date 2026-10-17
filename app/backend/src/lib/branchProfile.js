const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };

const CYRILLIC = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ғ: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  қ: "q",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  ў: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ҳ: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(value) {
  return Array.from(String(value || "")).map((char) => {
    const lower = char.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(CYRILLIC, lower)) {
      const mapped = CYRILLIC[lower];
      return char === lower ? mapped : mapped;
    }
    return char;
  }).join("");
}

function slugify(value) {
  const latin = transliterate(value)
    .toLowerCase()
    .replace(/['’`ʻʼ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return latin;
}

function weekdayKey(now = new Date()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tashkent", weekday: "short" }).format(now);
  return WEEKDAY[name] || "mon";
}

function dayShape(open, close, closed = false) {
  return { open, close, closed };
}

function isDay(value) {
  return value && typeof value.open === "string" && typeof value.close === "string";
}

function parseWorkingHours(value) {
  if (!value) return null;
  if (typeof value === "object") return value.allDay ? { allDay: true } : value;
  const text = String(value).trim();
  if (!text) return null;
  if (text === "24/7") return { allDay: true };
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.allDay) return { allDay: true };
      if (isDay(parsed?.mon)) return parsed;
    } catch {
      return null;
    }
    return null;
  }
  const parts = text.split(/[-–]/).map((part) => part.trim());
  if (parts.length >= 2 && /^\d{2}:\d{2}$/.test(parts[0]) && /^\d{2}:\d{2}$/.test(parts[1])) {
    const day = dayShape(parts[0], parts[1], false);
    return Object.fromEntries(WEEK.map((key) => [key, day]));
  }
  return null;
}

function formatWorkingHours(value, now = new Date()) {
  const parsed = parseWorkingHours(value);
  if (!parsed) return String(value || "");
  if (parsed.allDay) return "24/7";
  const openDays = WEEK.map((key) => parsed[key]).filter((day) => day && !day.closed);
  if (!openDays.length) return "";
  const same = openDays.every((day) => day.open === openDays[0].open && day.close === openDays[0].close);
  if (same) return `${openDays[0].open}–${openDays[0].close}`;
  const today = parsed[weekdayKey(now)];
  if (today && !today.closed) return `${today.open}–${today.close}`;
  return `${openDays[0].open}–${openDays[0].close}`;
}

function openingTime(value, now = new Date()) {
  const parsed = parseWorkingHours(value);
  if (!parsed || parsed.allDay) return "";
  if (!parsed.mon && typeof value === "string" && !String(value).startsWith("{")) {
    const open = String(value).split(/[-–]/)[0].trim();
    return /^\d{2}:\d{2}$/.test(open) ? open : "";
  }
  const start = WEEK.indexOf(weekdayKey(now));
  for (let offset = 0; offset < 7; offset += 1) {
    const key = WEEK[(start + offset) % 7];
    const day = parsed[key];
    if (day && !day.closed && day.open) return day.open;
  }
  return "";
}

module.exports = {
  WEEK,
  transliterate,
  slugify,
  weekdayKey,
  parseWorkingHours,
  formatWorkingHours,
  openingTime,
};
