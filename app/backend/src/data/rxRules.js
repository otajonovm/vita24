/**
 * Retsept belgisi qoidalari.
 *
 * Lekko katalogi (2026-10-25) Rx boolean yubormaydi. `atx` / `mnn` / `pharmGroup`
 * kalitlari bor, lekin tekshirilgan sahifalarda null edi. Shuning uchun belgi
 * shu ro'yxat va ATC prefikslari bilan qo'yiladi.
 *
 * MUHIM: ro'yxat to'liq emas. O'zbekiston Sog'liqni saqlash vazirligining
 * rasmiy retseptli dorilar ro'yxati asosida to'ldirish kerak. Yangi faol modda
 * qo'shish uchun RX_INN ga bitta yozuv yetadi: id, forms, names
 * (kirill, lotin, o'zbek lotin).
 *
 * forms:
 *   any                — har qanday shakl
 *   injection          — faqat inyeksiya / ampula
 *   oral-or-injection  — tabletka, kapsula yoki inyeksiya (krem/gel emas)
 */

const RX_ATC_PREFIXES = [
  "N02A",
  "J01",
  "J02",
  "J04",
  "J05",
  "N01",
  "N03",
  "N04",
  "N05",
  "N06",
  "N07",
  "H01",
  "H02",
  "H03",
  "A10",
  "B01",
  "C01",
  "C02",
  "C03",
  "C07",
  "C08",
  "C09",
  "C10",
  "G03",
  "L01",
  "L02",
  "L04",
];

const RX_INN = [
  { id: "amoxicillin", forms: "any", names: ["амоксициллин", "amoxicillin", "amoksitsillin", "amoxicilin"] },
  { id: "amoxiclav", forms: "any", names: ["амоксиклав", "amoxiclav", "amoksiklav", "amoxicillin clavulanate"] },
  { id: "augmentin", forms: "any", names: ["аугментин", "augmentin"] },
  { id: "azithromycin", forms: "any", names: ["азитромицин", "azithromycin", "azitromitsin"] },
  { id: "clarithromycin", forms: "any", names: ["кларитромицин", "clarithromycin", "klaritromitsin"] },
  { id: "ceftriaxone", forms: "any", names: ["цефтриаксон", "ceftriaxone", "seftriakson"] },
  { id: "cefazolin", forms: "any", names: ["цефазолин", "cefazolin", "sefazolin"] },
  { id: "cefixime", forms: "any", names: ["цефиксим", "cefixime", "sefiksim"] },
  { id: "ciprofloxacin", forms: "any", names: ["ципрофлоксацин", "ciprofloxacin", "siprofloksatsin"] },
  { id: "levofloxacin", forms: "any", names: ["левофлоксацин", "levofloxacin", "levofloksatsin"] },
  { id: "ofloxacin", forms: "any", names: ["офлоксацин", "ofloxacin", "ofloksatsin"] },
  { id: "doxycycline", forms: "any", names: ["доксициклин", "doxycycline", "doksitsiklin"] },
  { id: "metronidazole", forms: "oral-or-injection", names: ["метронидазол", "metronidazole", "metronidazol"] },
  { id: "tramadol", forms: "any", names: ["трамадол", "tramadol"] },
  { id: "phenazepam", forms: "any", names: ["феназепам", "phenazepam", "fenazepam"] },
  { id: "diazepam", forms: "any", names: ["диазепам", "diazepam"] },
  { id: "alprazolam", forms: "any", names: ["алпразолам", "alprazolam"] },
  { id: "gabapentin", forms: "any", names: ["габапентин", "gabapentin"] },
  { id: "pregabalin", forms: "any", names: ["прегабалин", "pregabalin"] },
  { id: "carbamazepine", forms: "any", names: ["карбамазепин", "carbamazepine", "karbamazepin"] },
  { id: "insulin", forms: "any", names: ["инсулин", "insulin", "инсулатард", "insulatard"] },
  { id: "prednisolone", forms: "injection", names: ["преднизолон", "prednisolone", "prednizolon"] },
  { id: "dexamethasone", forms: "injection", names: ["дексаметазон", "dexamethasone", "deksametazon"] },
  { id: "metformin", forms: "any", names: ["метформин", "metformin"] },
  { id: "enalapril", forms: "any", names: ["эналаприл", "enalapril"] },
  { id: "lisinopril", forms: "any", names: ["лизиноприл", "lisinopril", "lizinopril"] },
  { id: "amlodipine", forms: "any", names: ["амлодипин", "amlodipine", "amlodipin"] },
  { id: "bisoprolol", forms: "any", names: ["бисопролол", "bisoprolol"] },
  { id: "warfarin", forms: "any", names: ["варфарин", "warfarin"] },
];

const CYR_TO_LATIN = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ғ: "g",
  д: "d",
  е: "e",
  ё: "e",
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
  ў: "o",
  ф: "f",
  х: "x",
  ҳ: "h",
  ц: "s",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  ы: "y",
  і: "i",
  ї: "yi",
  є: "e",
  ґ: "g",
};

function foldRx(value) {
  const source = String(value || "").toLowerCase().replace(/ё/g, "е");
  let latin = "";
  for (const char of source) {
    latin += CYR_TO_LATIN[char] ?? char;
  }
  return latin
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(folded) {
  return folded ? folded.split(" ").filter(Boolean) : [];
}

function tokenStarts(token, needle) {
  if (!needle || needle.length < 6) return false;
  if (token === needle) return true;
  if (!token.startsWith(needle)) return false;
  const extra = token.length - needle.length;
  return extra === 1;
}

function textHasNeedle(folded, needle) {
  const parts = String(needle || "")
    .split(" ")
    .filter((part) => part.length >= 6);
  if (!parts.length) return false;
  const tokens = tokensOf(folded);
  return parts.every((part) => tokens.some((token) => tokenStarts(token, part)));
}

function hasTokenPrefix(folded, prefixes) {
  return tokensOf(folded).some((token) => prefixes.some((prefix) => token === prefix || token.startsWith(prefix)));
}

function isOralSolution(folded) {
  return /priema|vnutr|peroral/.test(folded);
}

function hasRrShorthand(folded) {
  let run = 0;
  for (const token of tokensOf(folded)) {
    run = token === "r" ? run + 1 : 0;
    if (run >= 2) return true;
  }
  return false;
}

function isInjectionForm(folded) {
  const tokens = tokensOf(folded);
  if (tokens.some((token) => token === "amp" || token.startsWith("ampul"))) return true;
  if (hasTokenPrefix(folded, ["ineks", "inyeksiya", "inyek", "infuz", "prshk"])) return true;
  if (hasTokenPrefix(folded, ["poroshok"]) && (tokens.includes("r") || folded.includes("rastvor"))) return true;
  if (isOralSolution(folded)) return false;
  return hasRrShorthand(folded);
}

function isOralForm(folded) {
  return hasTokenPrefix(folded, ["tab", "kaps"]);
}

function formAllows(forms, formFolded) {
  if (!forms || forms === "any") return true;
  if (forms === "injection") return isInjectionForm(formFolded);
  if (forms === "oral-or-injection") return isOralForm(formFolded) || isInjectionForm(formFolded);
  return false;
}

function matchInn(textFolded, formFolded) {
  for (const rule of RX_INN) {
    if (!formAllows(rule.forms, formFolded)) continue;
    for (const name of rule.names) {
      const needle = foldRx(name);
      if (textHasNeedle(textFolded, needle)) return rule.id;
    }
  }
  return null;
}

function normalizeAtc(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function matchAtc(atcCode) {
  const code = normalizeAtc(atcCode);
  if (!code) return null;
  const prefixes = [...RX_ATC_PREFIXES].sort((a, b) => b.length - a.length);
  return prefixes.find((prefix) => code.startsWith(prefix)) || null;
}

/**
 * @returns {{
 *   isPrescription: true | null,
 *   rxSource: "RULE" | null,
 *   rxNeedsReview: boolean,
 *   reason: string | null
 * }}
 * isPrescription null — qoida retsept deb belgilamadi (mavjud qiymatni o'chirmang).
 */
function classifyMedicine(fields = {}) {
  const atcPrefix = matchAtc(fields.atcCode);
  const text = [fields.name, fields.searchText, fields.activeIngredient].filter(Boolean).join(" ");
  const textFolded = foldRx(text);
  const formFolded = foldRx([fields.dosageForm, fields.name].filter(Boolean).join(" "));
  const inn = matchInn(textFolded, formFolded);
  if (atcPrefix || inn) {
    return {
      isPrescription: true,
      rxSource: "RULE",
      rxNeedsReview: false,
      reason: atcPrefix ? `atc:${atcPrefix}` : `inn:${inn}`,
    };
  }
  if (isInjectionForm(formFolded)) {
    return {
      isPrescription: null,
      rxSource: null,
      rxNeedsReview: true,
      reason: "form",
    };
  }
  return {
    isPrescription: null,
    rxSource: null,
    rxNeedsReview: false,
    reason: null,
  };
}

module.exports = {
  RX_ATC_PREFIXES,
  RX_INN,
  foldRx,
  classifyMedicine,
  isInjectionForm,
  matchAtc,
};
