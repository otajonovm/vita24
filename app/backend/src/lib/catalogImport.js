const HEADER_MAP = {
  nomi: "name",
  name: "name",
  "faol modda": "activeIngredient",
  activeingredient: "activeIngredient",
  doza: "dosage",
  dosage: "dosage",
  shakli: "dosageForm",
  shakl: "dosageForm",
  dosageform: "dosageForm",
  "qadoqdagi soni": "quantityInPack",
  qadoq: "quantityInPack",
  quantityinpack: "quantityInPack",
  "ishlab chiqaruvchi": "manufacturer",
  manufacturer: "manufacturer",
  kategoriya: "category",
  category: "category",
  retseptli: "isPrescription",
  isprescription: "isPrescription",
  "shtrix-kod": "barcode",
  "shtrix kod": "barcode",
  barcode: "barcode",
  "qo'llanilishi": "usage",
  "qollanilishi": "usage",
  usage: "usage",
  "qarshi ko'rsatmalar": "contraindications",
  "qarshi korsatmalar": "contraindications",
  contraindications: "contraindications",
  "saqlash sharoiti": "storageConditions",
  storageconditions: "storageConditions",
  "asosiy narx": "basePrice",
  baseprice: "basePrice",
};

const EXPORT_HEADERS = [
  ["Nomi", "name"],
  ["Faol modda", "activeIngredient"],
  ["Doza", "dosage"],
  ["Shakli", "dosageForm"],
  ["Qadoqdagi soni", "quantityInPack"],
  ["Ishlab chiqaruvchi", "manufacturer"],
  ["Kategoriya", "category"],
  ["Retseptli", "isPrescription"],
  ["Rx manbai", "rxSource"],
  ["Shtrix-kod", "barcode"],
  ["Qo'llanilishi", "usage"],
  ["Qarshi ko'rsatmalar", "contraindications"],
  ["Saqlash sharoiti", "storageConditions"],
  ["Asosiy narx", "basePrice"],
];

function headerKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[`'’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function mapHeader(value) {
  const key = headerKey(value).replace(/[^a-z0-9' -]/g, "");
  return HEADER_MAP[key] || HEADER_MAP[key.replace(/-/g, " ")] || null;
}

function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < src.length; index += 1) {
    const char = src[index];
    if (quoted) {
      if (char === '"') {
        if (src[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => String(value || "").trim()));
}

function rowsFromMatrix(matrix) {
  if (!matrix.length) return { headers: [], rows: [], error: "Fayl bo'sh" };
  const headers = matrix[0].map(mapHeader);
  if (!headers.includes("name")) {
    return { headers, rows: [], error: "Nomi ustuni topilmadi" };
  }
  const rows = matrix
    .slice(1)
    .map((line, index) => {
      const raw = {};
      headers.forEach((key, column) => {
        if (key) raw[key] = line[column];
      });
      return { line: index + 2, raw };
    })
    .filter((item) => Object.values(item.raw).some((value) => String(value || "").trim()));
  return { headers, rows, error: rows.length ? "" : "Ma'lumot qatorlari yo'q" };
}

function parseBool(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "ha", "yes", "true", "retseptli"].includes(text)) return true;
  if (["", "0", "yo'q", "yoq", "no", "false"].includes(text)) return false;
  return null;
}

function parseMoney(value) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(String(value).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || number > 100000000) return null;
  return Math.round(number * 100) / 100;
}

function classifyRow(entry, context) {
  const raw = entry.raw || entry;
  const errors = [];
  const name = String(raw.name || "").trim();
  const dosageForm = String(raw.dosageForm || "").trim();
  const manufacturer = String(raw.manufacturer || "").trim();
  const categoryName = String(raw.category || "").trim();
  const quantity = Number(String(raw.quantityInPack ?? "1").trim() || "1");
  const price = parseMoney(raw.basePrice);
  const prescription = parseBool(raw.isPrescription);
  const barcode = String(raw.barcode || "").trim();

  if (!name) errors.push("Nomi majburiy");
  else if (name.length > 180) errors.push("Nomi juda uzun");
  if (!dosageForm) errors.push("Shakli majburiy");
  if (!manufacturer) errors.push("Ishlab chiqaruvchi majburiy");
  if (!categoryName) errors.push("Kategoriya majburiy");
  else if (!context.categories.has(categoryName.toLowerCase())) errors.push(`Kategoriya topilmadi: ${categoryName}`);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) errors.push("Qadoqdagi soni musbat butun son bo'lishi kerak");
  if (price == null) errors.push("Asosiy narx noto'g'ri");
  if (prescription == null) errors.push("Retseptli ha yoki yo'q bo'lishi kerak");
  if (barcode.length > 64) errors.push("Shtrix-kod juda uzun");

  const byBarcode = barcode ? context.medicinesByBarcode.get(barcode) : null;
  const byName = name ? context.medicinesByName.get(name.toLowerCase()) : null;
  if (byBarcode && byName && byBarcode.id !== byName.id) {
    errors.push("Shtrix-kod va nom turli dorilarga tegishli");
  }
  const matched = byBarcode || byName || null;
  const existing = matched && !String(matched.id).startsWith("new-") ? matched : null;
  if (matched && !existing) errors.push("Faylda bu dori takrorlangan");

  return {
    line: entry.line,
    ok: errors.length === 0,
    errors,
    action: existing ? "update" : "create",
    medicineId: existing?.id || null,
    data: {
      name,
      activeIngredient: String(raw.activeIngredient || "").trim(),
      dosage: String(raw.dosage || "").trim(),
      dosageForm,
      quantityInPack: Number.isInteger(quantity) ? quantity : 1,
      manufacturer,
      category: categoryName,
      categoryId: context.categories.get(categoryName.toLowerCase()) || null,
      isPrescription: prescription === true,
      rxSource: "MANUAL",
      rxNeedsReview: false,
      barcode,
      usage: String(raw.usage || "").trim(),
      contraindications: String(raw.contraindications || "").trim(),
      storageConditions: String(raw.storageConditions || "").trim(),
      basePrice: price || 0,
    },
  };
}

function classifyRows(entries, context) {
  const rows = [];
  for (const entry of entries) {
    const row = classifyRow(entry, context);
    rows.push(row);
    if (!row.ok || row.action !== "create") continue;
    const placeholder = { id: `new-${row.line}`, name: row.data.name, barcode: row.data.barcode };
    context.medicinesByName.set(row.data.name.toLowerCase(), placeholder);
    if (row.data.barcode) context.medicinesByBarcode.set(row.data.barcode, placeholder);
  }
  return {
    rows,
    errorCount: rows.filter((row) => !row.ok).length,
    createCount: rows.filter((row) => row.ok && row.action === "create").length,
    updateCount: rows.filter((row) => row.ok && row.action === "update").length,
  };
}

module.exports = {
  EXPORT_HEADERS,
  parseCsv,
  rowsFromMatrix,
  classifyRow,
  classifyRows,
  parseMoney,
};
