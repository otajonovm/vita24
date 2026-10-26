const { searchVariants } = require("../lib/searchText");
const { escapeHtml, formatSom, stockAvailabilityLabel } = require("./utils");

function eligibleStocks(medicine) {
  return (medicine?.stocks || []).filter(
    (row) => Number(row.stockCount) > 0 && row.branch && row.branch.isActive !== false
  );
}

function isSearchableMedicine(medicine) {
  return Boolean(medicine?.isActive) && eligibleStocks(medicine).length > 0;
}

function cheapestPrice(stocks) {
  const prices = stocks.map((row) => Number(row.price)).filter((price) => Number.isFinite(price) && price > 0);
  if (!prices.length) return 0;
  return Math.min(...prices);
}

function summarizeMedicine(medicine) {
  const stocks = eligibleStocks(medicine);
  return {
    id: medicine.id,
    name: medicine.name,
    slug: medicine.slug,
    dosage: String(medicine.dosage || "").trim(),
    dosageForm: String(medicine.dosageForm || "").trim(),
    isPrescription: Boolean(medicine.isPrescription),
    price: cheapestPrice(stocks),
    branchCount: stocks.length,
    stocks,
  };
}

function buildSearchWhere(query) {
  const variants = searchVariants(query);
  return {
    isActive: true,
    stocks: {
      some: {
        stockCount: { gt: 0 },
        branch: { isActive: true },
      },
    },
    ...(variants.length
      ? {
          OR: variants.map((term) => ({ name: { contains: term, mode: "insensitive" } })),
        }
      : { id: "__never__" }),
  };
}

async function searchMedicines(query, db = require("../lib/prisma")) {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: false, code: "TOO_SHORT", items: [] };

  const rows = await db.medicine.findMany({
    where: buildSearchWhere(q),
    take: 10,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      dosage: true,
      dosageForm: true,
      isPrescription: true,
      isActive: true,
      stocks: {
        where: { stockCount: { gt: 0 }, branch: { isActive: true } },
        select: {
          price: true,
          stockCount: true,
          branch: {
            select: {
              id: true,
              name: true,
              address: true,
              isActive: true,
              lowStockThreshold: true,
            },
          },
        },
      },
    },
  });

  const items = rows.filter(isSearchableMedicine).map(summarizeMedicine);
  return { ok: true, items };
}

function formatMedicineCard(item) {
  const lines = [`<b>${escapeHtml(item.name)}</b>`];
  const dose = [item.dosage, item.dosageForm].filter(Boolean).join(" · ");
  if (dose) lines.push(escapeHtml(dose));
  if (item.price > 0) lines.push(`Eng arzon: ${escapeHtml(formatSom(item.price))}`);
  lines.push(`${item.branchCount} ta filialda bor`);
  if (item.isPrescription) lines.push("Retsept kerak");
  return lines.join("\n");
}

function formatBranchStocks(item) {
  const lines = [`<b>${escapeHtml(item.name)}</b>`];
  if (!item.stocks?.length) {
    lines.push("Hozir faol filiallarda qoldiq yo'q.");
    return lines.join("\n");
  }
  for (const row of item.stocks) {
    const label = stockAvailabilityLabel(row.stockCount, row.branch?.lowStockThreshold);
    const name = escapeHtml(row.branch?.name || "Filial");
    lines.push(`${name} — ${escapeHtml(formatSom(row.price))} — ${label}`);
  }
  return lines.join("\n");
}

module.exports = {
  eligibleStocks,
  isSearchableMedicine,
  summarizeMedicine,
  buildSearchWhere,
  searchMedicines,
  formatMedicineCard,
  formatBranchStocks,
};
