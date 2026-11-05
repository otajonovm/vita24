const { CATEGORIES } = require("./categoryCatalog");
const { matchBrandLexicon, matchMorphology, matchFormFallback } = require("./categoryLexicon");

const FALLBACK_SLUG = "boshqa";

/** WHO ATC 1–3 letter prefixes → category slug (Uzbekistan pharmacy simplified). */
const ATC_PREFIX_MAP = [
  ["A10", "diabet"],
  ["A11", "vitaminlar-bad"],
  ["A12", "vitaminlar-bad"],
  ["A02", "oshqozon-ichak"],
  ["A03", "oshqozon-ichak"],
  ["A04", "oshqozon-ichak"],
  ["A05", "oshqozon-ichak"],
  ["A06", "oshqozon-ichak"],
  ["A07", "oshqozon-ichak"],
  ["A09", "oshqozon-ichak"],
  ["B01", "yurak-qon"],
  ["B03", "vitaminlar-bad"],
  ["C0", "yurak-qon"],
  ["C1", "yurak-qon"],
  ["C2", "yurak-qon"],
  ["C3", "yurak-qon"],
  ["C4", "yurak-qon"],
  ["C5", "yurak-qon"],
  ["C6", "yurak-qon"],
  ["C7", "yurak-qon"],
  ["C8", "yurak-qon"],
  ["C9", "yurak-qon"],
  ["D0", "teri-kremlar"],
  ["D1", "teri-kremlar"],
  ["D2", "teri-kremlar"],
  ["D3", "teri-kremlar"],
  ["D4", "allergiya"],
  ["D5", "teri-kremlar"],
  ["D6", "teri-kremlar"],
  ["D7", "teri-kremlar"],
  ["D8", "teri-kremlar"],
  ["D9", "teri-kremlar"],
  ["G0", "ayollar"],
  ["G1", "ayollar"],
  ["G2", "ayollar"],
  ["G3", "ayollar"],
  ["H03", "boshqa"],
  ["J01", "antibiotiklar"],
  ["J02", "antibiotiklar"],
  ["J04", "antibiotiklar"],
  ["J05", "antibiotiklar"],
  ["M01", "ogriq-isitma"],
  ["M02", "bogim-mushak"],
  ["M03", "bogim-mushak"],
  ["M05", "bogim-mushak"],
  ["N02", "ogriq-isitma"],
  ["N05", "asab-uyqu"],
  ["N06", "asab-uyqu"],
  ["R01", "kuz-quloq-burun"],
  ["R02", "shamollash-yotal"],
  ["R03", "shamollash-yotal"],
  ["R05", "shamollash-yotal"],
  ["R06", "allergiya"],
  ["S01", "kuz-quloq-burun"],
  ["S02", "kuz-quloq-burun"],
  ["S03", "kuz-quloq-burun"],
  ["V04", "tibbiy-buyumlar"],
  ["V07", "tibbiy-buyumlar"],
];

/** Canonical ingredient / brand keys → category (from search synonyms + pharmacy lexicon). */
const CANONICAL_CATEGORY = {
  paratsetamol: "ogriq-isitma",
  ibuprofen: "ogriq-isitma",
  metamizol: "ogriq-isitma",
  "atsetilsalitsil kislota": "ogriq-isitma",
  ketoprofen: "ogriq-isitma",
  nimesulid: "ogriq-isitma",
  diklofenak: "ogriq-isitma",
  meloksikam: "ogriq-isitma",
  drotaverin: "oshqozon-ichak",
  omeprazol: "oshqozon-ichak",
  loperamid: "oshqozon-ichak",
  pantoprazol: "oshqozon-ichak",
  ranitidin: "oshqozon-ichak",
  smecta: "oshqozon-ichak",
  amoksitsillin: "antibiotiklar",
  azitromitsin: "antibiotiklar",
  tsiprofloksatsin: "antibiotiklar",
  tseftriakson: "antibiotiklar",
  doksitsiklin: "antibiotiklar",
  klaritromitsin: "antibiotiklar",
  metronidazol: "antibiotiklar",
  loratadin: "allergiya",
  tsetirizin: "allergiya",
  desloratadin: "allergiya",
  suprasteen: "allergiya",
  enalapril: "yurak-qon",
  amlodipin: "yurak-qon",
  losartan: "yurak-qon",
  atorvastatin: "yurak-qon",
  bisoprolol: "yurak-qon",
  "askorbin kislota": "vitaminlar-bad",
  kolekalsiferol: "vitaminlar-bad",
  melatonin: "asab-uyqu",
  ambroksol: "shamollash-yotal",
  bromgeksin: "shamollash-yotal",
  asetiltsistein: "shamollash-yotal",
  sitramon: "ogriq-isitma",
  metformin: "diabet",
  insulin: "diabet",
  glibenklamid: "diabet",
};

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ʻ|ʼ|’|‘|`/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return norm(value).replace(/[^a-z0-9а-яўқғҳӣ\u0400-\u04FF]+/gi, "");
}

/** Keyword rules: first match wins within priority order (lower = earlier). */
const KEYWORD_RULES = [
  {
    slug: "tibbiy-buyumlar",
    priority: 10,
    words: [
      "шприц",
      "syringe",
      "перчат",
      "перчатка",
      "презерватив",
      "кондом",
      "тест-полоск",
      "тест полоск",
      "глюкометр",
      "тонометр",
      "термометр",
      "маска медицин",
      "бинт",
      "пластырь",
      "ватн",
      "катетер",
      "капельниц",
      "инфузионн",
      "игла ",
      "needle",
      "бахил",
      "корсет",
      "бандаж",
      "ингалятор",
      "небулайзер",
    ],
  },
  {
    slug: "antibiotiklar",
    priority: 20,
    words: [
      "амоксициллин",
      "амоксиклав",
      "флемоксин",
      "азитромицин",
      "азитро",
      "сумамед",
      "кларитромицин",
      "ципрофлоксацин",
      "ципролет",
      "цефтриаксон",
      "цефазолин",
      "цефиксим",
      "цефалексин",
      "доксициклин",
      "метронидазол",
      "тинидазол",
      "левофлоксацин",
      "офлоксацин",
      "норфлоксацин",
      "ампициллин",
      "эритромицин",
      "джозамицин",
      "линкомицин",
      "гентамицин",
      "амикацин",
      "ванкомицин",
      "меропенем",
      "имипенем",
      "ко-тримоксазол",
      "бисептол",
      "нитрофурантоин",
      "фурадонин",
      "фуразидин",
      "нифуроксазид",
      "энтерофурил",
      "рифампицин",
      "изониазид",
      "флуконазол",
      "кетоконазол",
      "итраконазол",
      "тербинафин",
      "нистатин",
      "amoxicillin",
      "azithromycin",
      "ciprofloxacin",
      "антибиотик",
    ],
  },
  {
    slug: "diabet",
    priority: 25,
    words: [
      "инсулин",
      "insulin",
      "метформин",
      "metformin",
      "глибенкламид",
      "гликлазид",
      "глимепирид",
      "амарил",
      "диабетон",
      "сиофор",
      "глюкофаж",
      "форсига",
      "джардинс",
      "инвокана",
      "традулента",
      "новорапид",
      "лантус",
      "хумулин",
      "новомикс",
      "диабет",
      "сахарн",
      "глюкоза крови",
    ],
  },
  {
    slug: "yurak-qon",
    priority: 30,
    words: [
      "амлодипин",
      "амлодил",
      "амлорус",
      "амлесса",
      "эналаприл",
      "энап",
      "лизиноприл",
      "периндоприл",
      "рамприл",
      "амприлан",
      "лозартан",
      "валсартан",
      "телмисартан",
      "кандесартан",
      "бисопролол",
      "метопролол",
      "атенолол",
      "карведилол",
      "небиволол",
      "аторвастатин",
      "розувастатин",
      "симвастатин",
      "клопидогрел",
      "варфарин",
      "ксарелто",
      "эликвис",
      "кардиомагнил",
      "аспирин кардио",
      "нитроглицерин",
      "изосорбид",
      "молсидомин",
      "дигоксин",
      "фуросемид",
      "индапамид",
      "гидрохлоротиазид",
      "спиронолактон",
      "верапамил",
      "дилтиазем",
      "нифедипин",
      "каптоприл",
      "престариум",
      "нолипрел",
      "ко-диротон",
      "давление",
      "гипертенз",
      "сердечн",
      "қон босим",
      "qon bosim",
    ],
  },
  {
    slug: "ogriq-isitma",
    priority: 35,
    words: [
      "парацетамол",
      "paracetamol",
      "панадол",
      "эффералган",
      "ибупрофен",
      "nurofen",
      "нурофен",
      "анальгин",
      "метамизол",
      "цитрамон",
      "аспирин",
      "ацетилсалицил",
      "кетопрофен",
      "кетонал",
      "нимесулид",
      "найз",
      "нимесил",
      "диклофенак",
      "вольтар",
      "ортофен",
      "мелоксикам",
      "мовалис",
      "целекоксиб",
      "дексалгин",
      "кеторолак",
      "кетанов",
      "трамадол",
      "спазмалгон",
      "баралгин",
      "пенталгин",
      "темпалгин",
      "андипал",
      "антигриппин",
      "фервекс",
      "терафлю",
      "колдрекс",
      "ринза",
      "максколд",
      "боли",
      "жаропониз",
      "температур",
      "isitma",
      "og'riq",
      "ogriq",
    ],
  },
  {
    slug: "shamollash-yotal",
    priority: 40,
    words: [
      "амброксол",
      "амбробене",
      "лазолван",
      "бромгексин",
      "ацетилцистеин",
      "ацц ",
      "флуимуцил",
      "карбоцистеин",
      "синекод",
      "стоптуссин",
      "гербион",
      "доктор мом",
      "антикашель",
      "мукалтин",
      "линкас",
      "проспан",
      "геделикс",
      "эреспал",
      "эрдостеин",
      "осельтамивир",
      "тамифлю",
      "оксолинов",
      "интерферон",
      "гриппферон",
      "кагоцел",
      "арбидол",
      "ингавирин",
      "анаферон",
      "циклоферон",
      "ангримакс",
      "кашель",
      "yo'tal",
      "yotal",
      "йўтал",
      "shamollash",
      "простуд",
      "отхаркив",
      "муколитик",
      "горло",
      "ангал",
      "стрепсилс",
      "септолете",
      "фарингосепт",
      "лиз",
      "пастилки",
    ],
  },
  {
    slug: "allergiya",
    priority: 45,
    words: [
      "лоратадин",
      "кларитин",
      "цетиризин",
      "зиртек",
      "зодак",
      "дезлоратадин",
      "эриус",
      "супрастин",
      "хлорпирамин",
      "тавегил",
      "фенкарол",
      "фексофенадин",
      "аллегра",
      "аллервэй",
      "алер-g",
      "аллева",
      "кестин",
      "аллергия",
      "allergiya",
      "антигистамин",
      "поллиноз",
    ],
  },
  {
    slug: "oshqozon-ichak",
    priority: 50,
    words: [
      "омепразол",
      "омез",
      "пантопразол",
      "нольпаза",
      "эзомепразол",
      "нексиум",
      "ранитидин",
      "фамотидин",
      "алмагель",
      "маалокс",
      "фосфалюгель",
      "гевискон",
      "смекта",
      "смектит",
      "лоперамид",
      "имодиум",
      "активированный уголь",
      "полисорб",
      "энтеросгель",
      "хилак",
      "линекс",
      "бифиформ",
      "бифидумбактерин",
      "лактобактерин",
      "эспумизан",
      "симетикон",
      "мезим",
      "креон",
      "панкреатин",
      "фестал",
      "домперидон",
      "мотилиум",
      "метоклопрамид",
      "церукал",
      "дротаверин",
      "но-шпа",
      "ношпа",
      "дюспаталин",
      "тримебутин",
      "форлакс",
      "дюфалак",
      "лактулоза",
      "глицеринов",
      "свечи глицерин",
      "аллохол",
      "хофитол",
      "урсосан",
      "урсодезоксихол",
      "эссенциале",
      "гептрал",
      "фосфоглив",
      "желчегон",
      "гастрит",
      "изжог",
      "диарея",
      "запор",
      "oshqozon",
      "метеоризм",
    ],
  },
  {
    slug: "bogim-mushak",
    priority: 55,
    words: [
      "хондроитин",
      "глюкозамин",
      "терафлекс",
      "дона ",
      "алфлутоп",
      "цель-т",
      "траумель",
      "фастум",
      "долгит",
      "финалгон",
      "капсикам",
      "випросал",
      "найз гель",
      "диклофенак гель",
      "диклофенак мазь",
      "артроз",
      "артрит",
      "сустав",
      "мышц",
      "миорелакс",
      "мидокалм",
      "сирдалуд",
      "баклофен",
      "хондропротектор",
      "osteoporosis",
      "остеопороз",
      "кальций-д3",
    ],
  },
  {
    slug: "kuz-quloq-burun",
    priority: 60,
    words: [
      "глазн",
      "офтал",
      "ophthal",
      "визин",
      "тауфон",
      "тимолом",
      "атропин",
      "сульфацил",
      "альбуцид",
      "тобрекс",
      "ципромед",
      "офтан",
      "систейн",
      "искусственн слез",
      "ушн",
      "отитол",
      "отипакс",
      "софрадекс",
      "називин",
      "ксилометазолин",
      "оксиметазолин",
      "ринонорм",
      "аквалор",
      "аквамарис",
      "физиомер",
      "маример",
      "снифф",
      "назол",
      "отривин",
      "гализолин",
      "ринофлуимуцил",
      "полидекса",
      "изофра",
      "спрей назал",
      "капли глаз",
      "капли уш",
      "капли назал",
      "rohto",
      "burun",
      "quloq",
      "ko'z",
      "koz ",
    ],
  },
  {
    slug: "ayollar",
    priority: 65,
    words: [
      "вагин",
      "гинекол",
      "свечи вагин",
      "клотримазол",
      "пимафуцин",
      "тержинан",
      "полижинакс",
      "бетадин свеч",
      "флуомизин",
      "лактагель",
      "эстроген",
      "прогестерон",
      "дюфастон",
      "утрожестан",
      "фолиев",
      "фолиевая",
      "для женщин",
      "женск",
      "мастопат",
      "молочниц",
      "кандид",
      "контрацептив",
      "регулон",
      "яровин",
      "джаз",
      "диане",
      "ярина",
      "midiana",
      "менструал",
      "климакс",
      "ayollar",
      "аёллар",
    ],
  },
  {
    slug: "asab-uyqu",
    priority: 70,
    words: [
      "мелатонин",
      "мелаксен",
      "сонвит",
      "донаормил",
      "донормил",
      "глицин",
      "адаптол",
      "афобазол",
      "новопассит",
      "персен",
      "валидол",
      "корвалол",
      "валокордин",
      "пустырник",
      "валериана",
      "валериан",
      "магне b6",
      "магне-b6",
      "нейромультивит",
      "мильгамма",
      "комбилипен",
      "фенибут",
      "феназепам",
      "диазепам",
      "клоназепам",
      "амитриптилин",
      "сертралин",
      "флуоксетин",
      "эсциталопрам",
      "антидепресс",
      "седатив",
      "успокаивающ",
      "бессонниц",
      "uyqu",
      "стресс",
      "тревог",
      "невроз",
      "5-htp",
      "гидрокситриптофан",
    ],
  },
  {
    slug: "vitaminlar-bad",
    priority: 80,
    words: [
      "витамин",
      "vitamin",
      "мультивитамин",
      "поливитамин",
      "аскорбин",
      "аскорбинка",
      "аквадетрим",
      "вигантол",
      "колекальциферол",
      "ретинол",
      "токоферол",
      "биотин",
      "омега-3",
      "омега 3",
      "рыбий жир",
      "магний",
      "цинк",
      "железо",
      "феррум",
      "сорбифер",
      "мальтофер",
      "фолиевая кислота",
      "кальций",
      "кальцемин",
      "компливит",
      "супрадин",
      "витрум",
      "алфавит",
      "центрум",
      "дуовит",
      "реввит",
      "ундевит",
      "аэровит",
      "гексавит",
      "бад",
      "биологически актив",
      "пищевая добавка",
      "коэнзим",
      "l-карнитин",
      "карнитин",
      "коллаген",
      "пробиотик",
      "пребиотик",
      "спирулина",
      "хлорелла",
      "элеутерококк",
      "женьшень",
      "эхинацея",
      "имун",
    ],
  },
  {
    slug: "teri-kremlar",
    priority: 85,
    words: [
      " крем",
      "крем ",
      "крем.",
      " мазь",
      "мазь ",
      "мазь.",
      " гель",
      "гель ",
      "бальзам",
      "лосьон",
      "шампунь",
      "дермат",
      "псориаз",
      "экзема",
      "акне",
      "угр",
      "бепантен",
      "пантенол",
      "дексаметазон мазь",
      "гидрокортизон мазь",
      "синафлан",
      "адвантан",
      "элоком",
      "акридерм",
      "тридерм",
      "клотримазол крем",
      "ламизил",
      "экзодерил",
      "микоспор",
      "цинковая мазь",
      "салицилов",
      "ихтиол",
      " Levomekol",
      "левомеколь",
      "солкосерил",
      "контрактубекс",
      "акнекутан",
      "роаккутан",
      "изотретиноин",
      "солнцезащит",
      "spf",
      "увлажняющ",
      "косметик",
      "для кожи",
      "кожн",
    ],
  },
  {
    slug: "bolalar",
    priority: 90,
    words: [
      "детский",
      "детск",
      "детское",
      "для детей",
      "для детей",
      "baby",
      "infant",
      "bolalar",
      "болалар",
      "младенц",
      "новорожден",
      "педиатр",
      "юниор",
      "kids",
      "child",
    ],
  },
];

const SORTED_RULES = [...KEYWORD_RULES].sort((a, b) => a.priority - b.priority);

function matchAtc(atcCode) {
  const code = String(atcCode || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!code) return null;
  for (const [prefix, slug] of ATC_PREFIX_MAP) {
    if (code.startsWith(prefix)) {
      return { slug, reason: "atc", matchedRule: `ATC ${prefix}*` };
    }
  }
  return null;
}

function matchCanonical(text, synonymIndex) {
  const raw = norm(text);
  if (!raw) return null;
  const packed = compact(raw);

  if (CANONICAL_CATEGORY[raw]) {
    return {
      slug: CANONICAL_CATEGORY[raw],
      reason: "ingredient",
      matchedRule: `canonical:${raw}`,
    };
  }

  for (const [key, slug] of Object.entries(CANONICAL_CATEGORY)) {
    if (raw.includes(key) || packed.includes(compact(key))) {
      return { slug, reason: "ingredient", matchedRule: `canonical-contains:${key}` };
    }
  }

  if (synonymIndex && synonymIndex.size) {
    for (const [term, info] of synonymIndex) {
      if (!term) continue;
      if (raw.includes(term) || packed.includes(compact(term))) {
        const slug = CANONICAL_CATEGORY[info.canonical] || info.categorySlug;
        if (slug) {
          return {
            slug,
            reason: "synonym",
            matchedRule: `synonym:${term}->${info.canonical}`,
          };
        }
      }
    }
  }

  return null;
}

function matchKeywords(haystack) {
  const text = ` ${norm(haystack)} `;
  const kidsMarker = /детск|для детей|bolalar|болалар|baby|infant|\bkids\b|младенц|новорожден/.test(text);
  const topicalJoint =
    /(гель|мазь|крем).{0,24}(диклофенак|ибупрофен|кетопрофен|нимесулид|индометацин)|(диклофенак|кетопрофен|нимесулид).{0,16}(гель|мазь|крем)|фастум|долгит|финалгон|капсикам|артроксан|алфлутоп/.test(
      text
    );
  if (topicalJoint) {
    return { slug: "bogim-mushak", reason: "keyword", matchedRule: "topical-nsaid/joint" };
  }
  if (
    /цинков\S*\s+мазь|мазь\s+цинков|бепантен|левомекол|левомеколь|синафлан|адвантан|ихтиол|салицилов\S*\s+мазь/.test(
      text
    )
  ) {
    return { slug: "teri-kremlar", reason: "keyword", matchedRule: "topical-skin" };
  }

  let hit = null;
  for (const rule of SORTED_RULES) {
    if (rule.slug === "bolalar") continue;
    for (const word of rule.words) {
      const needle = norm(word);
      if (!needle) continue;
      if (text.includes(needle)) {
        hit = { slug: rule.slug, reason: "keyword", matchedRule: word.trim() };
        break;
      }
    }
    if (hit) break;
  }

  if (
    kidsMarker &&
    (!hit ||
      ["shamollash-yotal", "vitaminlar-bad", "ogriq-isitma", "allergiya", "oshqozon-ichak"].includes(hit.slug))
  ) {
    return { slug: "bolalar", reason: "keyword", matchedRule: "детский/bolalar" };
  }

  if (hit) return hit;

  for (const rule of SORTED_RULES) {
    if (rule.slug !== "bolalar") continue;
    for (const word of rule.words) {
      const needle = norm(word);
      if (needle && text.includes(needle)) {
        return { slug: "bolalar", reason: "keyword", matchedRule: word.trim() };
      }
    }
  }
  return null;
}

/**
 * Classify a medicine-like object into a category slug.
 * @param {{ name?: string, dosageForm?: string, activeIngredient?: string, atcCode?: string, searchText?: string }} medicine
 * @param {{ synonymIndex?: Map<string, {canonical:string, categorySlug?:string}> }} [options]
 */
function classifyMedicine(medicine, options = {}) {
  const name = String(medicine?.name || "");
  const dosageForm = String(medicine?.dosageForm || "");
  const activeIngredient = String(medicine?.activeIngredient || "");
  const atcCode = medicine?.atcCode;
  const searchText = String(medicine?.searchText || "");
  const formUseful = dosageForm && !/^noma'?lum$/i.test(dosageForm.trim());

  const atcHit = matchAtc(atcCode);
  if (atcHit) return atcHit;

  const innHit = matchCanonical(activeIngredient, options.synonymIndex);
  if (innHit) return innHit;

  const nameInnHit = matchCanonical(name, options.synonymIndex);
  if (nameInnHit) return nameInnHit;

  const haystack = [name, formUseful ? dosageForm : "", searchText].filter(Boolean).join(" ");
  const brand = matchBrandLexicon(haystack);
  if (brand) return brand;

  const morph = matchMorphology(haystack);
  if (morph) return morph;

  const kw = matchKeywords(haystack);
  if (kw) return kw;

  const form = matchFormFallback(haystack);
  if (form) return form;

  return { slug: FALLBACK_SLUG, reason: "fallback", matchedRule: "boshqa" };
}

function buildSynonymIndex(rows) {
  const index = new Map();
  for (const row of rows || []) {
    const term = norm(row.term);
    const canonical = norm(row.canonical);
    if (!term || !canonical) continue;
    const categorySlug = CANONICAL_CATEGORY[canonical] || undefined;
    index.set(term, { canonical, categorySlug, type: row.type });
    if (!index.has(canonical)) {
      index.set(canonical, { canonical, categorySlug, type: row.type });
    }
  }
  return index;
}

function knownSlugs() {
  return CATEGORIES.map((item) => item.slug);
}

module.exports = {
  FALLBACK_SLUG,
  ATC_PREFIX_MAP,
  CANONICAL_CATEGORY,
  KEYWORD_RULES,
  classifyMedicine,
  buildSynonymIndex,
  matchAtc,
  matchKeywords,
  knownSlugs,
  norm,
};
