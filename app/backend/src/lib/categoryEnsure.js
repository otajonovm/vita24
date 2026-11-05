const prisma = require("./prisma");
const { CATEGORIES } = require("./categoryCatalog");
const { classifyMedicine, FALLBACK_SLUG } = require("./categoryClassify");

const cache = new Map();

function definitionFor(slug) {
  return CATEGORIES.find((item) => item.slug === slug) || CATEGORIES.find((item) => item.slug === FALLBACK_SLUG);
}

async function ensureTaxonomyCategory(slug, client = prisma) {
  const def = definitionFor(slug);
  const key = def.slug;
  if (cache.has(key)) return cache.get(key);

  let row = await client.category.findUnique({ where: { slug: key } });
  if (!row) {
    for (const legacyId of def.legacyIds || []) {
      row = await client.category.findUnique({ where: { id: legacyId } });
      if (row) break;
    }
  }
  if (!row) {
    for (const legacySlug of def.legacySlugs || []) {
      row = await client.category.findUnique({ where: { slug: legacySlug } });
      if (row) break;
    }
  }

  const data = {
    name: def.name,
    nameUz: def.nameUz,
    nameUzCyrl: def.nameUzCyrl,
    nameRu: def.nameRu,
    slug: def.slug,
    icon: def.icon,
    sortOrder: def.sortOrder,
  };

  if (row) {
    row = await client.category.update({ where: { id: row.id }, data });
  } else {
    try {
      row = await client.category.create({ data });
    } catch (error) {
      if (error.code === "P2002") {
        row = await client.category.findUnique({ where: { slug: key } });
      } else {
        throw error;
      }
    }
  }

  cache.set(key, row);
  return row;
}

async function classifyToCategory(medicineLike, client = prisma) {
  const hit = classifyMedicine(medicineLike);
  const category = await ensureTaxonomyCategory(hit.slug, client);
  return { category, hit };
}

function clearCategoryCache() {
  cache.clear();
}

module.exports = {
  ensureTaxonomyCategory,
  classifyToCategory,
  clearCategoryCache,
};
