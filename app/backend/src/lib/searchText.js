const LATIN_TO_CYRILLIC = [
  ["yo", "ё"],
  ["yu", "ю"],
  ["ya", "я"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["o'", "ў"],
  ["o‘", "ў"],
  ["o`", "ў"],
  ["g'", "ғ"],
  ["g‘", "ғ"],
  ["g`", "ғ"],
  ["a", "а"],
  ["b", "б"],
  ["d", "д"],
  ["e", "е"],
  ["f", "ф"],
  ["g", "г"],
  ["h", "ҳ"],
  ["i", "и"],
  ["j", "ж"],
  ["k", "к"],
  ["l", "л"],
  ["m", "м"],
  ["n", "н"],
  ["o", "о"],
  ["p", "п"],
  ["q", "қ"],
  ["r", "р"],
  ["s", "с"],
  ["t", "т"],
  ["u", "у"],
  ["v", "в"],
  ["x", "х"],
  ["y", "й"],
  ["z", "з"],
];

const CYRILLIC_TO_LATIN = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ғ: "g'",
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
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ў: "o'",
  ф: "f",
  х: "x",
  ҳ: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function toCyrillic(value) {
  let text = String(value || "").toLowerCase();
  for (const [from, to] of LATIN_TO_CYRILLIC) {
    text = text.split(from).join(to);
  }
  return text;
}

function toLatin(value) {
  return String(value || "")
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("");
}

function normalizeSearch(value) {
  let text = toLatin(String(value || ""))
    .toLowerCase()
    .replace(/[ʻ’‘`´]/g, "'")
    .replace(/o'|g'/g, (token) => token[0]);
  text = text.replace(/ch/g, "\u0001");
  text = text.replace(/ts/g, "s").replace(/ks/g, "x").replace(/c/g, "s");
  text = text.replace(/\u0001/g, "ch");
  let prev = "";
  while (prev !== text) {
    prev = text;
    text = text.replace(/ss/g, "s").replace(/ll/g, "l");
  }
  return text
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildSearchText(medicine) {
  const parts = [
    medicine?.name,
    medicine?.activeIngredient,
    medicine?.manufacturer,
    medicine?.dosageForm,
    medicine?.description,
  ];
  return normalizeSearch(parts.filter(Boolean).join(" "));
}

function extractDosageNumbers(value) {
  const numbers = [];
  const text = String(value || "").replace(/\b(\d+(?:[.,]\d+)?)\s*(?:mg|ml|iu|g|%)?/gi, (match, number) => {
    numbers.push(String(number).replace(",", "."));
    return " ";
  });
  return { text: text.replace(/\s+/g, " ").trim(), numbers: [...new Set(numbers)] };
}

/** QWERTY → ЙЦУКЕН (lotin klavishda kirill yozmoqchi bo'lganda). */
const EN_TO_RU_LAYOUT = {
  q: "й",
  w: "ц",
  e: "у",
  r: "к",
  t: "е",
  y: "н",
  u: "г",
  i: "ш",
  o: "щ",
  p: "з",
  "[": "х",
  "]": "ъ",
  a: "ф",
  s: "ы",
  d: "в",
  f: "а",
  g: "п",
  h: "р",
  j: "о",
  k: "л",
  l: "д",
  ";": "ж",
  "'": "э",
  z: "я",
  x: "ч",
  c: "с",
  v: "м",
  b: "и",
  n: "т",
  m: "ь",
  ",": "б",
  ".": "ю",
  "`": "ё",
};

const RU_TO_EN_LAYOUT = Object.fromEntries(
  Object.entries(EN_TO_RU_LAYOUT).map(([latin, cyr]) => [cyr, latin])
);

function mapLayout(value, table) {
  return String(value || "")
    .toLowerCase()
    .split("")
    .map((char) => table[char] ?? char)
    .join("");
}

/** Kirill klaviatura yoqilgan holda lotin so'z yozilganda (зфкфсуефьщд → paracetamol). */
function fixRuLayoutToLatin(value) {
  return mapLayout(value, RU_TO_EN_LAYOUT);
}

/** Lotin klaviatura yoqilgan holda kirill so'z yozilganda (ghfhwtnfvjk → парацетамол). */
function fixEnLayoutToCyrillic(value) {
  return mapLayout(value, EN_TO_RU_LAYOUT);
}

function adjacentSwaps(value) {
  const text = String(value || "");
  if (text.length < 4) return [];
  const out = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    if (text[i] === text[i + 1]) continue;
    out.push(`${text.slice(0, i)}${text[i + 1]}${text[i]}${text.slice(i + 2)}`);
  }
  return out;
}

function searchVariants(input) {
  const raw = String(input || "").trim();
  if (raw.length < 2) return [];
  const variants = new Set([raw, toCyrillic(raw), toLatin(raw)]);
  const fromRuKeys = fixRuLayoutToLatin(raw);
  const fromEnKeys = fixEnLayoutToCyrillic(raw);
  if (fromRuKeys !== raw.toLowerCase()) {
    variants.add(fromRuKeys);
    variants.add(toLatin(fromRuKeys));
    variants.add(toCyrillic(fromRuKeys));
  }
  if (fromEnKeys !== raw.toLowerCase()) {
    variants.add(fromEnKeys);
    variants.add(toLatin(fromEnKeys));
    variants.add(toCyrillic(fromEnKeys));
  }
  if (raw.length >= 4 && raw.length <= 16) {
    for (const swap of adjacentSwaps(normalizeSearch(raw))) {
      variants.add(swap);
    }
  }
  if (raw.length >= 5) {
    const head = raw.slice(0, 4);
    variants.add(head);
    variants.add(toCyrillic(head));
    variants.add(toLatin(head));
  }
  return [...variants].map((item) => item.trim()).filter((item) => item.length >= 2);
}

function levenshtein(left, right) {
  if (left === right) return 0;
  const a = String(left || "");
  const b = String(right || "");
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  if (Math.abs(a.length - b.length) > 4) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

function suggestName(query, names) {
  const needles = [...new Set(searchVariants(query).map((item) => item.toLowerCase()))];
  if (!needles.length) return "";
  let best = "";
  let bestDist = 99;
  for (const name of names || []) {
    const full = String(name || "").trim();
    if (!full) continue;
    const token = full.split(/\s+/)[0];
    for (const cand of token === full ? [full] : [token]) {
      const low = cand.toLowerCase();
      for (const needle of needles) {
        if (!needle || low === needle) continue;
        if (Math.abs(low.length - needle.length) > 4) continue;
        const dist = levenshtein(needle, low);
        const limit = needle.length <= 4 ? 1 : Math.min(3, Math.floor(needle.length * 0.34));
        if (dist > 0 && dist <= limit && dist < bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
    }
  }
  return best;
}

module.exports = {
  searchVariants,
  toCyrillic,
  toLatin,
  suggestName,
  normalizeSearch,
  escapeLike,
  buildSearchText,
  extractDosageNumbers,
  fixRuLayoutToLatin,
  fixEnLayoutToCyrillic,
  adjacentSwaps,
  levenshtein,
};
