const { Prisma } = require("../../generated/prisma");
const prisma = require("./prisma");
const {
  normalizeSearch,
  escapeLike,
  extractDosageNumbers,
  fixRuLayoutToLatin,
  fixEnLayoutToCyrillic,
  adjacentSwaps,
  toLatin,
  levenshtein,
} = require("./searchText");

const CANDIDATE_LIMIT = 400;
const SYNONYM_TTL_MS = 30_000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

let synonymCache = { at: 0, rows: [] };
let lastPruneAt = 0;

function invalidateSynonymCache() {
  synonymCache.at = 0;
}

async function loadSynonyms() {
  if (Date.now() - synonymCache.at < SYNONYM_TTL_MS) return synonymCache.rows;
  const rows = await prisma.searchSynonym.findMany({
    select: { term: true, canonical: true, type: true },
  });
  synonymCache = {
    at: Date.now(),
    rows: rows.map((row) => ({
      ...row,
      termNorm: normalizeSearch(row.term),
      canonicalNorm: normalizeSearch(row.canonical),
    })),
  };
  return synonymCache.rows;
}

function collectQueryForms(raw) {
  const { text, numbers } = extractDosageNumbers(raw);
  const primary = normalizeSearch(text);
  const forms = new Set([primary].filter(Boolean));
  const rawLower = String(text || raw || "").toLowerCase();
  // hf↔fh — QWERTY da а/р (f/h) eslashda tez-tez aralashadi (ghfhwtnfvjk → gfhfwtnfvjk).
  const hfFlipped = rawLower.includes("hf") || rawLower.includes("fh") ? rawLower.replace(/hf/g, "\0").replace(/fh/g, "hf").replace(/\0/g, "fh") : "";
  const layoutSources = [rawLower, hfFlipped].filter(Boolean);
  for (const source of layoutSources) {
    const layoutLatin = normalizeSearch(fixRuLayoutToLatin(source));
    const layoutFromEn = normalizeSearch(toLatin(fixEnLayoutToCyrillic(source)));
    if (layoutLatin) forms.add(layoutLatin);
    if (layoutFromEn) forms.add(layoutFromEn);
  }
  // Faqat asosiy + layout formalariga bitta adjacent-swap qatlami (portlashni oldini olish).
  const swapBases = [primary, ...[...forms].filter((item) => item !== primary)].slice(0, 3);
  for (const form of swapBases) {
    if (form && form.length >= 4 && form.length <= 14) {
      for (const swap of adjacentSwaps(form)) forms.add(normalizeSearch(swap));
    }
  }
  return { text, numbers, primary, forms: [...forms].filter((item) => item && item.length >= 2) };
}

function expandQuery(raw, synonyms) {
  const collected = collectQueryForms(raw);
  const { numbers, primary } = collected;
  const formSet = new Set(collected.forms);
  // Layout/typo natijasini sinonim termlariga yaqinlashtirish (prarsetamol → parasetamol).
  for (const form of [...formSet]) {
    if (!form || form.length < 6) continue;
    for (const row of synonyms) {
      for (const target of [row.termNorm, row.canonicalNorm]) {
        if (!target || target.length < 6) continue;
        if (Math.abs(target.length - form.length) > 2) continue;
        const limit = target.length <= 8 ? 1 : 2;
        if (levenshtein(form, target) <= limit) formSet.add(target);
      }
    }
  }
  const forms = [...formSet];
  const normalized = primary || forms[0] || "";
  const tokens = [...new Set(forms.flatMap((form) => form.split(" ").filter((token) => token.length >= 2)))];
  const seen = new Map();

  function addExpansion(next, key) {
    const previous = seen.get(key);
    if (previous && previous.termNorm.length >= next.termNorm.length) return;
    seen.set(key, next);
  }

  for (const row of synonyms) {
    if (!row.termNorm || row.termNorm.length < 2 || !row.canonicalNorm) continue;
    const hit = forms.some(
      (form) =>
        form === row.termNorm ||
        form.split(" ").includes(row.termNorm) ||
        (row.termNorm.includes(" ") && form.includes(row.termNorm)) ||
        (form.length >= 3 && row.termNorm.startsWith(form) && row.termNorm.length <= form.length + 6)
    );
    if (!hit) continue;
    addExpansion(
      {
        norm: row.canonicalNorm,
        type: row.type,
        label: row.canonical,
        term: row.term,
        termNorm: row.termNorm,
      },
      `${row.type}:${row.canonicalNorm}`
    );
  }

  // Canonical (ingredient) qidirilsa — BRAND termlarini ham candidate qilish (дротаверин → но-шпа).
  for (const form of forms) {
    for (const row of synonyms) {
      if (row.type !== "BRAND" || !row.termNorm || row.canonicalNorm !== form) continue;
      addExpansion(
        {
          norm: row.termNorm,
          type: "BRAND",
          label: row.term,
          term: row.canonical,
          termNorm: row.termNorm,
          brandOf: row.canonicalNorm,
        },
        `BRANDTERM:${row.termNorm}`
      );
    }
  }

  // Brand prefix orqali topilgan ingredient uchun boshqa brand/analog termlari.
  for (const expansion of [...seen.values()]) {
    if (expansion.type !== "BRAND" && expansion.type !== "INGREDIENT" && expansion.type !== "SPELLING") continue;
    const canonical = expansion.norm;
    for (const row of synonyms) {
      if (row.type !== "BRAND" || row.canonicalNorm !== canonical || !row.termNorm) continue;
      addExpansion(
        {
          norm: row.termNorm,
          type: "BRAND",
          label: row.term,
          term: row.canonical,
          termNorm: row.termNorm,
          brandOf: canonical,
        },
        `BRANDTERM:${row.termNorm}`
      );
    }
  }

  return {
    raw: String(raw || "").trim(),
    normalized,
    forms,
    tokens,
    numbers,
    expansions: [...seen.values()],
  };
}

function doseSource(medicine) {
  const field = String(medicine.dosage || "").trim();
  return (field || String(medicine.name || "")).toLowerCase();
}

function matchesDose(medicine, numbers) {
  if (!numbers.length) return true;
  const source = doseSource(medicine);
  return numbers.every((number) => new RegExp(`(^|\\D)${number}(\\D|$)`).test(source));
}

function scoreRow(row, query) {
  const text = String(row.searchText || "");
  const nameNorm = normalizeSearch(row.name);
  const actNorm = row.activeIngredient ? normalizeSearch(row.activeIngredient) : "";
  const forms = query.forms?.length ? query.forms : [query.normalized].filter(Boolean);
  let score = 0;
  let matchReason = "";
  let matchGroup = "name";

  for (const form of forms) {
    if (!form) continue;
    if (nameNorm === form || text === form) {
      score = Math.max(score, 100);
      matchReason = "To'liq nom";
      matchGroup = "name";
    } else if (nameNorm.startsWith(form) || text.startsWith(`${form} `) || text.startsWith(form)) {
      if (score < 80) {
        score = 80;
        matchReason = "Nom mosligi";
        matchGroup = "name";
      }
    }
  }

  for (const expansion of query.expansions) {
    const hitName = nameNorm.includes(expansion.norm) || text.includes(expansion.norm);
    const hitIngredient = actNorm && (actNorm.includes(expansion.norm) || expansion.norm.includes(actNorm));
    const hit = hitName || hitIngredient;
    if (!hit) continue;

    if (expansion.type === "BRAND") {
      // brandOf: ingredient → brand (дротаверин → но-шпа). Aks holda brand → ingredient analog.
      const queryLooksLikeThisBrand = forms.some(
        (form) => form && (nameNorm.startsWith(form) || nameNorm.includes(form) || expansion.termNorm?.startsWith(form))
      );
      if (expansion.brandOf && hitName) {
        if (score < 92) {
          score = 92;
          matchReason = expansion.label;
          matchGroup = "name";
        }
      } else if (hitName && queryLooksLikeThisBrand && expansion.termNorm && nameNorm.includes(expansion.termNorm.slice(0, Math.min(4, expansion.termNorm.length)))) {
        if (score < 92) {
          score = 92;
          matchReason = expansion.label;
          matchGroup = "name";
        }
      } else if (hit) {
        if (score < 70) {
          score = 70;
          matchReason = `Ta'sir etuvchi modda: ${expansion.label}`;
          matchGroup = "ingredient";
        }
      }
      continue;
    }

    if (expansion.type === "SYMPTOM") {
      const canonicalHit =
        (actNorm && (actNorm.includes(expansion.norm) || expansion.norm.includes(actNorm))) ||
        text.includes(expansion.norm) ||
        nameNorm.includes(expansion.norm);
      const next = canonicalHit ? 78 : 45;
      if (score < next) {
        score = next;
        matchReason = `${expansion.term} uchun`;
        matchGroup = "symptom";
      }
      continue;
    }

    if (expansion.type !== "SYMPTOM" && score < 70) {
      score = 70;
      matchReason = `Ta'sir etuvchi modda: ${expansion.label}`;
      matchGroup = "ingredient";
    }
  }

  for (const form of forms) {
    if (!form) continue;
    if (score < 60 && (text.includes(form) || nameNorm.includes(form))) {
      score = 60;
      if (matchGroup === "name") matchReason = "Nom ichida";
    }
    if (score < 60 && actNorm && actNorm.includes(form)) {
      score = 60;
      matchReason = "Ta'sir etuvchi modda: " + row.activeIngredient;
      matchGroup = "ingredient";
    }
  }

  const similarity = Number(row.similarity || 0);
  const fuzzy = similarity > 0.28 ? 40 * similarity : 0;
  if (fuzzy > score) {
    score = fuzzy;
    matchReason = "O'xshash yozuv";
    matchGroup = "name";
  }

  for (const form of forms) {
    if (!form || form.length < 4) continue;
    const flatQuery = form.replace(/ /g, "");
    const flatText = text.replace(/ /g, "");
    const flatName = nameNorm.replace(/ /g, "");
    if ((flatText.includes(flatQuery) || flatName.includes(flatQuery)) && score < 65) {
      score = 65;
      if (matchGroup === "name") matchReason = "Nom ichida";
    }
  }

  const doseHit = matchesDose(row, query.numbers);
  if (query.numbers.length && doseHit && score > 0) {
    score += 25;
  } else if (query.numbers.length && doseHit && !query.normalized) {
    score = 50;
    matchReason = `Doza: ${query.numbers.join(", ")}`;
  } else if (query.numbers.length && query.normalized && !doseHit) {
    row.doseMiss = true;
  }

  if (score <= 0) return null;
  return { id: row.id, score, matchReason, matchGroup, doseMiss: Boolean(row.doseMiss) };
}

function medicineSearchSql(rawQuery) {
  const { text } = extractDosageNumbers(rawQuery);
  const normalized = normalizeSearch(text || rawQuery);
  const like = `%${escapeLike(normalized || String(rawQuery || "").trim())}%`;
  const rawLike = `%${escapeLike(String(rawQuery || "").trim())}%`;
  const needle = normalized || String(rawQuery || "").trim();
  return Prisma.sql`(
    m."searchText" ILIKE ${like} ESCAPE ${"\\"}
    OR word_similarity(${needle}, m."searchText") > 0.35
    OR m.name ILIKE ${rawLike} ESCAPE ${"\\"}
    OR COALESCE(m.barcode, '') ILIKE ${rawLike} ESCAPE ${"\\"}
    OR COALESCE(m."activeIngredient", '') ILIKE ${rawLike} ESCAPE ${"\\"}
  )`;
}

async function findCandidates(query, { categoryId, featured, includeInactive, inactiveOnly }) {
  const forms = query.forms?.length ? query.forms : [query.normalized].filter(Boolean);
  const expansionNorms = query.expansions.map((item) => item.norm).filter(Boolean);
  const preferred = new Set([query.normalized, ...expansionNorms].filter(Boolean));
  const terms = [
    ...new Set([...expansionNorms, query.normalized, ...forms]),
  ]
    .filter((term) => term && term.length >= 2)
    .sort((a, b) => {
      const pref = Number(preferred.has(b)) - Number(preferred.has(a));
      if (pref) return pref;
      // Prefer letter-heavy dictionary-like tokens over keyboard mash.
      const vowel = (value) => (value.match(/[aeiou]/g) || []).length;
      return vowel(b) - vowel(a) || b.length - a.length;
    })
    .slice(0, 20);
  const likeParts = terms.map(
    (term) => Prisma.sql`m."searchText" ILIKE ${`%${escapeLike(term)}%`} ESCAPE ${"\\"}`
  );
  const likeSql = likeParts.length ? Prisma.join(likeParts, " OR ") : Prisma.sql`FALSE`;
  const trigramNeedle = forms.find((form) => form.length >= 3) || query.normalized;
  const trigramSql =
    trigramNeedle && trigramNeedle.length >= 3
      ? Prisma.sql`OR ${trigramNeedle}::text <% m."searchText"`
      : Prisma.empty;

  const rawTerm = String(query.raw || "").trim();
  const rawLike = rawTerm ? `%${escapeLike(rawTerm)}%` : null;
  const normLike = query.normalized ? `%${escapeLike(query.normalized)}%` : null;
  const fallbackCond = rawLike
    ? Prisma.sql`(m.name ILIKE ${rawLike} ESCAPE ${"\\"} OR COALESCE(m."activeIngredient", '') ILIKE ${rawLike} ESCAPE ${"\\"})`
    : normLike
      ? Prisma.sql`(m.name ILIKE ${normLike} ESCAPE ${"\\"} OR COALESCE(m."activeIngredient", '') ILIKE ${normLike} ESCAPE ${"\\"})`
      : Prisma.empty;
  const fallbackSql = fallbackCond !== Prisma.empty ? Prisma.sql`OR ${fallbackCond}` : Prisma.empty;
  const doseSql = query.numbers.length && !query.normalized
    ? Prisma.sql`OR (${Prisma.join(
        query.numbers.map((number) => Prisma.sql`COALESCE(m.dosage, '') ILIKE ${`%${escapeLike(number)}%`}`),
        " AND "
      )})`
    : Prisma.empty;
  const activeSql = inactiveOnly
    ? Prisma.sql`AND m."isActive" = false`
    : includeInactive
      ? Prisma.empty
      : Prisma.sql`AND m."isActive" = true`;
  const categorySql = categoryId ? Prisma.sql`AND m."categoryId" = ${categoryId}` : Prisma.empty;
  const featuredSql = featured ? Prisma.sql`AND m."showOnHome" = true` : Prisma.empty;

  const simNeedle = trigramNeedle || query.normalized || "";
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.28', true)`;
    return tx.$queryRaw`
      SELECT
        m.id,
        m.name,
        m.dosage,
        COALESCE(m."activeIngredient", '') AS "activeIngredient",
        m."searchText" AS "searchText",
        GREATEST(
          word_similarity(${simNeedle}, m."searchText"),
          word_similarity(${simNeedle}, m.name)
        ) AS similarity
      FROM "Medicine" m
      WHERE (
        ${likeSql}
        ${trigramSql}
        ${doseSql}
        ${fallbackSql}
      )
      ${activeSql}
      ${categorySql}
      ${featuredSql}
      ORDER BY
        CASE WHEN (${likeSql}) THEN 1 ELSE 0 END DESC,
        CASE WHEN (${fallbackCond !== Prisma.empty ? fallbackCond : Prisma.sql`FALSE`}) THEN 1 ELSE 0 END DESC,
        GREATEST(
          word_similarity(${simNeedle}, m."searchText"),
          word_similarity(${simNeedle}, m.name)
        ) DESC
      LIMIT ${CANDIDATE_LIMIT}
    `;
  });
}

async function closestNames(normalized) {
  if (!normalized || normalized.length < 3) return [];
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.2', true)`;
    return tx.$queryRaw`
      SELECT m.id, m.name, word_similarity(${normalized}, m."searchText") AS similarity
      FROM "Medicine" m
      WHERE m."isActive" = true
        AND ${normalized}::text <% m."searchText"
        AND word_similarity(${normalized}, m."searchText") > 0.2
      ORDER BY similarity DESC
      LIMIT 5
    `;
  });
}

async function fallbackShelf(branchId) {
  const stockWhere = branchId
    ? { branchId, stockCount: { gt: 0 } }
    : { stockCount: { gt: 0 } };
  const [popular, categories] = await Promise.all([
    prisma.medicine.findMany({
      where: { isActive: true, showOnHome: true, stocks: { some: stockWhere } },
      select: { id: true },
      orderBy: [{ homeSortOrder: "asc" }, { name: "asc" }],
      take: 8,
    }),
    prisma.category.findMany({
      where: { medicines: { some: { isActive: true, stocks: { some: stockWhere } } } },
      orderBy: { sortOrder: "asc" },
      take: 8,
      select: { id: true, name: true, slug: true },
    }),
  ]);
  return { popularIds: popular.map((item) => item.id), categories };
}

async function rankMedicines({
  query: rawQuery,
  branchId = null,
  categoryId,
  inStockOnly = false,
  featured = false,
  includeInactive = false,
  inactiveOnly = false,
  limit = 24,
  offset = 0,
  log = false,
  logZero = false,
}) {
  const synonyms = await loadSynonyms();
  const query = expandQuery(rawQuery, synonyms);
  if (!query.normalized && !query.numbers.length) {
    return { hits: [], total: 0, suggestions: [], popularIds: [], categories: [] };
  }

  const candidates = await findCandidates(query, { categoryId, featured, includeInactive, inactiveOnly });
  let scored = candidates.map((row) => scoreRow(row, query)).filter(Boolean);
  // Zaif fuzzy (xyzqwe → tasodifiy) ni kesib tashlash.
  scored = scored.filter((row) => row.score >= 40 || row.matchGroup === "symptom");
  if (scored.some((row) => row.score >= 60)) {
    scored = scored.filter((row) => row.score >= 60 || row.matchGroup === "symptom");
  }
  if (query.numbers.length && scored.some((row) => !row.doseMiss)) {
    scored = scored.filter((row) => !row.doseMiss);
  }

  const ids = scored.map((row) => row.id);
  const [stocks, pops] = ids.length
    ? await Promise.all([
        prisma.branchStock.findMany({
          where: {
            medicineId: { in: ids },
            ...(branchId ? { branchId } : {}),
          },
          select: { medicineId: true, stockCount: true, reservedCount: true },
        }),
        prisma.orderItem.groupBy({
          by: ["medicineId"],
          where: { medicineId: { in: ids } },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const stockById = new Map();
  for (const stock of stocks) {
    const available = Number(stock.stockCount || 0) - Number(stock.reservedCount || 0);
    if (available > 0) stockById.set(stock.medicineId, true);
  }
  const ordersById = new Map(pops.map((row) => [row.medicineId, row._count._all]));
  const nameById = new Map(candidates.map((row) => [row.id, row.name]));

  let ranked = scored.map((row) => ({
    ...row,
    name: nameById.get(row.id) || "",
    inStock: stockById.has(row.id),
    orders: ordersById.get(row.id) || 0,
  }));
  if (inStockOnly) ranked = ranked.filter((row) => row.inStock);

  // Omborda borlar avval; OOS pastga. Score ikkinchi darajali.
  ranked.sort(
    (a, b) =>
      Number(b.inStock) - Number(a.inStock) ||
      b.score - a.score ||
      b.orders - a.orders ||
      a.name.localeCompare(b.name, "uz")
  );

  // Suggest/limit kichik bo'lganda faqat OOS chiqsa — ingredient/brand analoglarini majburan qo'sh.
  const pageSlice = ranked.slice(offset, offset + limit);
  const pageHasStock = pageSlice.some((row) => row.inStock);
  if (!pageHasStock && pageSlice.length > 0 && offset === 0) {
    const ingredientNorms = [
      ...new Set(
        query.expansions
          .filter((item) => item.type === "BRAND" || item.type === "INGREDIENT" || item.type === "SPELLING")
          .map((item) => item.brandOf || item.norm)
          .filter(Boolean)
      ),
    ];
    if (ingredientNorms.length) {
      const analogCandidates = ranked.filter(
        (row) =>
          row.inStock &&
          (row.matchGroup === "ingredient" ||
            ingredientNorms.some((norm) => normalizeSearch(row.name).includes(norm) || String(nameById.get(row.id) || "").toLowerCase().includes(norm)))
      );
      // Candidates may already be in ranked but below the OOS-only window — promote them.
      const promote = ranked.filter((row) => row.inStock && row.matchGroup === "ingredient").slice(0, Math.max(2, Math.min(4, limit - 1)));
      if (promote.length) {
        const promoteIds = new Set(promote.map((row) => row.id));
        ranked = [...promote, ...ranked.filter((row) => !promoteIds.has(row.id))];
      } else if (analogCandidates.length) {
        const promoteIds = new Set(analogCandidates.slice(0, 3).map((row) => row.id));
        ranked = [...analogCandidates.slice(0, 3), ...ranked.filter((row) => !promoteIds.has(row.id))];
      }
    }
  }

  const total = ranked.length;
  const hits = ranked.slice(offset, offset + limit);
  let suggestions = [];
  let popularIds = [];
  let categories = [];
  if (total === 0) {
    const nearNeedles = [...new Set([query.normalized, ...(query.forms || [])])].filter(
      (item) => item && item.length >= 3
    );
    const [nearLists, shelf] = await Promise.all([
      Promise.all(nearNeedles.slice(0, 3).map((needle) => closestNames(needle))),
      fallbackShelf(branchId),
    ]);
    const seenNames = new Set();
    suggestions = nearLists
      .flat()
      .filter((row) => {
        if (seenNames.has(row.name)) return false;
        seenNames.add(row.name);
        return true;
      })
      .slice(0, 5)
      .map((row) => ({ id: row.id, name: row.name }));
    popularIds = shelf.popularIds;
    categories = shelf.categories;
  }

  if (log || (logZero && total === 0)) {
    void logSearch({
      query: query.raw,
      normalized: query.normalized,
      resultsCount: total,
      branchId,
    }).catch(() => {});
  }

  return { hits, total, suggestions, popularIds, categories };
}

async function logSearch({ query, normalized, resultsCount, branchId }) {
  if (!query) return;
  const since = new Date(Date.now() - 2 * 60 * 1000);
  const recent = await prisma.searchLog.findFirst({
    where: { normalized, resultsCount, clickedMedicineId: null, createdAt: { gte: since } },
    select: { id: true },
  });
  if (recent) return;
  await prisma.searchLog.create({
    data: {
      query: query.slice(0, 100),
      normalized: normalized.slice(0, 120),
      resultsCount,
      branchId: branchId || null,
    },
  });
}

async function markSearchClick({ query, medicineId, branchId }) {
  const { text } = extractDosageNumbers(query);
  const normalized = normalizeSearch(text || query);
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const recent = await prisma.searchLog.findFirst({
    where: { normalized, clickedMedicineId: null, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (recent) {
    await prisma.searchLog.update({
      where: { id: recent.id },
      data: { clickedMedicineId: medicineId },
    });
    return;
  }
  await prisma.searchLog.create({
    data: {
      query: String(query).slice(0, 100),
      normalized: normalized.slice(0, 120),
      resultsCount: 1,
      clickedMedicineId: medicineId,
      branchId: branchId || null,
    },
  });
}

async function pruneSearchLogs() {
  if (Date.now() - lastPruneAt < PRUNE_EVERY_MS) return 0;
  lastPruneAt = Date.now();
  const cutoff = new Date(Date.now() - LOG_RETENTION_MS);
  const result = await prisma.searchLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}

function topGroups(rows, limit) {
  return [...rows]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, limit)
    .map((row) => ({
      query: row._max.query || row.normalized,
      normalized: row.normalized,
      count: row._count._all,
    }))
    .filter((row) => row.query);
}

function looksLikeTypoOf(candidate, known) {
  const a = normalizeSearch(candidate);
  const b = normalizeSearch(known);
  if (!a || !b || a === b) return a === b;
  if (Math.abs(a.length - b.length) > 2) return false;
  let diff = 0;
  const max = Math.max(a.length, b.length);
  for (let i = 0, j = 0; i < a.length || j < b.length; ) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    diff += 1;
    if (diff > 2) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return diff > 0 && diff <= 2 && max >= 6;
}

async function popularQueries(limit = 8) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [rows, synonyms] = await Promise.all([
    prisma.searchLog.groupBy({
      by: ["normalized"],
      where: { createdAt: { gte: since }, resultsCount: { gt: 0 } },
      _count: { _all: true },
      _max: { query: true },
    }),
    loadSynonyms(),
  ]);
  const synonymTerms = synonyms.map((row) => row.term).filter(Boolean);
  const preferredByNorm = new Map();
  for (const row of synonyms) {
    const key = row.termNorm;
    if (!key) continue;
    // Prefer latin UI terms over mixed/cyrillic duplicates.
    const current = preferredByNorm.get(key);
    const isLatin = /^[\x00-\x7F]+$/.test(row.term);
    if (!current || (isLatin && !/^[\x00-\x7F]+$/.test(current))) {
      preferredByNorm.set(key, row.term);
    }
  }

  const cleaned = [];
  const seen = new Set();
  for (const item of topGroups(rows, limit * 4)) {
    let display = String(item.query || "").trim();
    if (display.length < 2) continue;
    const norm = normalizeSearch(display);
    if (!norm || norm.length < 2) continue;
    // Typo filter: tish og'rg'i → tish og'rig'i (sinonim yoki yaqin to'g'ri yozuv).
    const exactSyn = synonymTerms.find((term) => normalizeSearch(term) === norm);
    const nearSyn = exactSyn
      ? null
      : synonymTerms.find((term) => looksLikeTypoOf(display, term));
    if (nearSyn) display = nearSyn;
    else if (preferredByNorm.has(norm)) display = preferredByNorm.get(norm);
    else display = toLatin(display) || display;

    const key = normalizeSearch(display);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ query: display, count: item.count });
    if (cleaned.length >= limit) break;
  }
  return cleaned;
}

async function searchStats() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where = { createdAt: { gte: since } };
  const [top, zero, total, clicked] = await Promise.all([
    prisma.searchLog.groupBy({
      by: ["normalized"],
      where,
      _count: { _all: true },
      _max: { query: true },
    }),
    prisma.searchLog.groupBy({
      by: ["normalized"],
      where: { ...where, resultsCount: 0 },
      _count: { _all: true },
      _max: { query: true },
    }),
    prisma.searchLog.count({ where }),
    prisma.searchLog.count({ where: { ...where, clickedMedicineId: { not: null } } }),
  ]);
  return {
    top: topGroups(top, 15),
    zero: topGroups(zero, 15),
    conversion: {
      searches: total,
      clicks: clicked,
      rate: total ? Math.round((clicked / total) * 1000) / 10 : 0,
    },
  };
}

async function explainSearch(rawQuery) {
  const normalized = normalizeSearch(extractDosageNumbers(rawQuery).text || rawQuery);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.35', true)`;
    return tx.$queryRaw`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT m.id
      FROM "Medicine" m
      WHERE m."isActive" = true
        AND (
          m."searchText" ILIKE ${`%${escapeLike(normalized)}%`} ESCAPE ${"\\"}
          OR ${normalized}::text <% m."searchText"
        )
      LIMIT 50
    `;
  });
}

module.exports = {
  invalidateSynonymCache,
  expandQuery,
  loadSynonyms,
  medicineSearchSql,
  rankMedicines,
  findCandidates,
  markSearchClick,
  pruneSearchLogs,
  popularQueries,
  searchStats,
  explainSearch,
  fallbackShelf,
};
