const { Prisma } = require("../../generated/prisma");
const prisma = require("./prisma");
const { normalizeSearch, escapeLike, extractDosageNumbers } = require("./searchText");

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

function expandQuery(raw, synonyms) {
  const { text, numbers } = extractDosageNumbers(raw);
  const normalized = normalizeSearch(text);
  const tokens = normalized.split(" ").filter((token) => token.length >= 2);
  const seen = new Map();

  for (const row of synonyms) {
    if (!row.termNorm || row.termNorm.length < 2) continue;
    const hit =
      normalized === row.termNorm ||
      tokens.includes(row.termNorm) ||
      (row.termNorm.includes(" ") && normalized.includes(row.termNorm));
    if (!hit || !row.canonicalNorm) continue;
    const key = `${row.type}:${row.canonicalNorm}`;
    const next = {
      norm: row.canonicalNorm,
      type: row.type,
      label: row.canonical,
      term: row.term,
      termNorm: row.termNorm,
    };
    const previous = seen.get(key);
    if (previous && previous.termNorm.length >= next.termNorm.length) continue;
    seen.set(key, next);
  }

  return { raw: String(raw || "").trim(), normalized, tokens, numbers, expansions: [...seen.values()] };
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
  let score = 0;
  let matchReason = "";
  let matchGroup = "name";

  if (query.normalized && (nameNorm === query.normalized || text === query.normalized)) {
    score = 100;
    matchReason = "To'liq nom";
  } else if (
    query.normalized &&
    (nameNorm.startsWith(query.normalized) || text.startsWith(`${query.normalized} `) || text.startsWith(query.normalized))
  ) {
    score = 80;
    matchReason = "Nom mosligi";
  }

  for (const expansion of query.expansions) {
    const hit = text.includes(expansion.norm) || nameNorm.includes(expansion.norm);
    if (!hit) continue;
    if (expansion.type === "SYMPTOM" && score < 30) {
      score = 30;
      matchReason = `${expansion.term} uchun`;
      matchGroup = "symptom";
    } else if (expansion.type !== "SYMPTOM" && score < 70) {
      score = 70;
      matchReason = `Ta'sir etuvchi modda: ${expansion.label}`;
      matchGroup = "ingredient";
    }
  }

  if (score < 60 && query.normalized && (text.includes(query.normalized) || nameNorm.includes(query.normalized))) {
    score = 60;
    if (matchGroup === "name") {
      matchReason = "Nom ichida";
    }
  }

  const actNorm = row.activeIngredient ? normalizeSearch(row.activeIngredient) : "";
  if (score < 60 && query.normalized && actNorm && actNorm.includes(query.normalized)) {
    score = 60;
    if (matchGroup === "name") {
      matchReason = "Ta'sir etuvchi modda: " + row.activeIngredient;
      matchGroup = "ingredient";
    }
  }

  const similarity = Number(row.similarity || 0);
  const fuzzy = similarity > 0.35 ? 40 * similarity : 0;
  if (fuzzy > score) {
    score = fuzzy;
    matchReason = "O'xshash yozuv";
    matchGroup = "name";
  }

  const flatQuery = query.normalized.replace(/ /g, "");
  const flatText = text.replace(/ /g, "");
  if (flatQuery.length >= 4 && flatText.includes(flatQuery) && score < 65) {
    score = 65;
    if (matchGroup === "name") matchReason = "Nom ichida";
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
  const terms = [...new Set([query.normalized, ...query.expansions.map((item) => item.norm)])].filter(
    (term) => term && term.length >= 2
  );
  const likeParts = terms.map(
    (term) => Prisma.sql`m."searchText" ILIKE ${`%${escapeLike(term)}%`} ESCAPE ${"\\"}`
  );
  const likeSql = likeParts.length ? Prisma.join(likeParts, " OR ") : Prisma.sql`FALSE`;
  const trigramSql =
    query.normalized.length >= 3
      ? Prisma.sql`OR ${query.normalized}::text <% m."searchText"`
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

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', '0.35', true)`;
    return tx.$queryRaw`
      SELECT
        m.id,
        m.name,
        m.dosage,
        COALESCE(m."activeIngredient", '') AS "activeIngredient",
        m."searchText" AS "searchText",
        GREATEST(
          word_similarity(${query.normalized}, m."searchText"),
          word_similarity(${query.normalized}, m.name)
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
          word_similarity(${query.normalized}, m."searchText"),
          word_similarity(${query.normalized}, m.name)
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
}) {
  const synonyms = await loadSynonyms();
  const query = expandQuery(rawQuery, synonyms);
  if (!query.normalized && !query.numbers.length) {
    return { hits: [], total: 0, suggestions: [], popularIds: [], categories: [] };
  }

  const candidates = await findCandidates(query, { categoryId, featured, includeInactive, inactiveOnly });
  let scored = candidates.map((row) => scoreRow(row, query)).filter(Boolean);
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
  ranked.sort(
    (a, b) => b.score - a.score || Number(b.inStock) - Number(a.inStock) || b.orders - a.orders || a.name.localeCompare(b.name, "uz")
  );

  const total = ranked.length;
  const hits = ranked.slice(offset, offset + limit);
  let suggestions = [];
  let popularIds = [];
  let categories = [];
  if (total === 0) {
    const [near, shelf] = await Promise.all([closestNames(query.normalized), fallbackShelf(branchId)]);
    suggestions = near.map((row) => ({ id: row.id, name: row.name }));
    popularIds = shelf.popularIds;
    categories = shelf.categories;
  }

  if (log) {
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

async function popularQueries(limit = 8) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.searchLog.groupBy({
    by: ["normalized"],
    where: { createdAt: { gte: since }, resultsCount: { gt: 0 } },
    _count: { _all: true },
    _max: { query: true },
  });
  return topGroups(rows, limit).map(({ query, count }) => ({ query, count }));
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
  markSearchClick,
  pruneSearchLogs,
  popularQueries,
  searchStats,
  explainSearch,
  fallbackShelf,
};
