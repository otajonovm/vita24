/** @type {import("../types/pharmacy.js").Branch[]} */
export const MOCK_BRANCHES = [
  {
    id: "branch-chilonzor",
    name: "Vita24 Chilonzor",
    address: "Bunyodkor shoh ko'chasi 7, Chilonzor tumani",
    latitude: 41.2754,
    longitude: 69.2048,
    phone: "+998 71 200 24 01",
    isActive: true,
    district: "Chilonzor",
    city: "Toshkent",
    workingHours: "24/7",
  },
  {
    id: "branch-yunusobod",
    name: "Vita24 Yunusobod",
    address: "Amir Temur shoh ko'chasi 108, Yunusobod tumani",
    latitude: 41.3671,
    longitude: 69.2894,
    phone: "+998 71 200 24 02",
    isActive: true,
    district: "Yunusobod",
    city: "Toshkent",
    workingHours: "08:00-23:00",
  },
  {
    id: "branch-mirzo-ulugbek",
    name: "Vita24 Mirzo Ulug'bek",
    address: "Buyuk Ipak Yo'li 123, Mirzo Ulug'bek tumani",
    latitude: 41.3275,
    longitude: 69.3342,
    phone: "+998 71 200 24 03",
    isActive: true,
    district: "Mirzo Ulug'bek",
    city: "Toshkent",
    workingHours: "24/7",
  },
  {
    id: "branch-sergeli",
    name: "Vita24 Sergeli",
    address: "Yangihayot yo'li 45, Sergeli tumani",
    latitude: 41.2213,
    longitude: 69.2176,
    phone: "+998 71 200 24 04",
    isActive: true,
    district: "Sergeli",
    city: "Toshkent",
    workingHours: "08:00-22:00",
  },
];

/** @type {import("../types/pharmacy.js").Category[]} */
export const MOCK_CATEGORIES = [
  { id: "cat-flu", name: "Shamollash va gripp", slug: "shamollash", iconName: "thermometer" },
  { id: "cat-stomach", name: "Oshqozon", slug: "oshqozon", iconName: "utensils" },
  { id: "cat-allergy", name: "Allergiya", slug: "allergiya", iconName: "flower" },
  { id: "cat-pain", name: "Og'riq qoldiruvchi", slug: "ogriq", iconName: "pill" },
  { id: "cat-vitamin", name: "Vitaminlar", slug: "vitaminlar", iconName: "leaf" },
  { id: "cat-cardio", name: "Yurak-qon tomir", slug: "yurak", iconName: "heart" },
];

/** @type {Array<import("../types/pharmacy.js").Medicine & { manufacturer?: string }>} */
const CATALOG = [
  {
    id: "med-paracetamol",
    name: "Paracetamol 500 mg",
    description: "Isitma va bosh og'rig'iga qarshi, retseptsiz vosita.",
    dosage: "500 mg",
    dosageUnit: "tabletka",
    isPrescription: false,
    imageUrl: "",
    categoryId: "cat-flu",
    price: 6500,
    stockCount: 80,
  },
  {
    id: "med-amoxicillin",
    name: "Amoksitsillin 500 mg",
    description: "Keng spektrli antibiotik. Farmatsevt retseptni tekshiradi.",
    dosage: "500 mg",
    dosageUnit: "tabletka",
    isPrescription: true,
    imageUrl: "",
    categoryId: "cat-flu",
    price: 18500,
    stockCount: 30,
  },
  {
    id: "med-azithromycin",
    name: "Azitromitsin 500 mg",
    description: "Nafas yo'llari infeksiyalarida qo'llanadi. Retseptli.",
    dosage: "500 mg",
    dosageUnit: "tabletka",
    isPrescription: true,
    imageUrl: "",
    categoryId: "cat-flu",
    price: 24600,
    stockCount: 18,
  },
  {
    id: "med-omeprazole",
    name: "Omeprazol 20 mg",
    description: "Oshqozon kislotasini kamaytiradi, qabuli ertalab.",
    dosage: "20 mg",
    dosageUnit: "tabletka",
    isPrescription: false,
    imageUrl: "",
    categoryId: "cat-stomach",
    price: 12400,
    stockCount: 44,
  },
  {
    id: "med-ciprofloxacin",
    name: "Tsiprofloksatsin 500 mg",
    description: "Siydik va ovqat hazm tizimi infeksiyalarida. Retseptli.",
    dosage: "500 mg",
    dosageUnit: "tabletka",
    isPrescription: true,
    imageUrl: "",
    categoryId: "cat-stomach",
    price: 19800,
    stockCount: 20,
  },
  {
    id: "med-loratadine",
    name: "Loratadin 10 mg",
    description: "Mavsumiy allergiya va toshmaga qarshi antihistamin.",
    dosage: "10 mg",
    dosageUnit: "tabletka",
    isPrescription: false,
    imageUrl: "",
    categoryId: "cat-allergy",
    price: 7800,
    stockCount: 45,
  },
  {
    id: "med-ibuprofen",
    name: "Ibuprofen 400 mg",
    description: "Yallig'lanish va og'riqni kamaytiruvchi vosita.",
    dosage: "400 mg",
    dosageUnit: "tabletka",
    isPrescription: false,
    imageUrl: "",
    categoryId: "cat-pain",
    price: 9800,
    stockCount: 54,
  },
  {
    id: "med-ketonal",
    name: "Ketonal 100 mg",
    description: "O'tkir og'riqlarda qisqa muddatli yordam.",
    dosage: "100 mg",
    dosageUnit: "tabletka",
    isPrescription: false,
    imageUrl: "",
    categoryId: "cat-pain",
    price: 28600,
    stockCount: 26,
  },
  {
    id: "med-vitaminc",
    name: "Vitamin C 1000 mg",
    description: "Immunitetni qo'llab-quvvatlovchi askorbin kislota.",
    dosage: "1000 mg",
    dosageUnit: "tabletka",
    isPrescription: false,
    imageUrl: "",
    categoryId: "cat-vitamin",
    price: 21000,
    stockCount: 60,
  },
  {
    id: "med-vitamind",
    name: "Vitamin D3 2000 IU",
    description: "Suyak va immunitet uchun kunlik D3.",
    dosage: "2000 IU",
    dosageUnit: "tabletka",
    isPrescription: false,
    imageUrl: "",
    categoryId: "cat-vitamin",
    price: 89000,
    stockCount: 16,
  },
  {
    id: "med-aspirin",
    name: "Aspirin Kardio 100 mg",
    description: "Yurak-qon tomir profilaktikasi uchun past doza.",
    dosage: "100 mg",
    dosageUnit: "tabletka",
    isPrescription: false,
    imageUrl: "",
    categoryId: "cat-cardio",
    price: 32000,
    stockCount: 40,
  },
  {
    id: "med-enalapril",
    name: "Enalapril 10 mg",
    description: "Qon bosimini tushirish uchun. Retseptli vosita.",
    dosage: "10 mg",
    dosageUnit: "tabletka",
    isPrescription: true,
    imageUrl: "",
    categoryId: "cat-cardio",
    price: 14200,
    stockCount: 22,
  },
];

const STOCK_BY_BRANCH = {
  "branch-chilonzor": {},
  "branch-yunusobod": {
    "med-paracetamol": { price: 6900, stockCount: 42 },
    "med-amoxicillin": { price: 19200, stockCount: 12 },
    "med-azithromycin": { price: 25100, stockCount: 9 },
    "med-omeprazole": { price: 13100, stockCount: 22 },
    "med-ciprofloxacin": { price: 20500, stockCount: 11 },
    "med-loratadine": { price: 8100, stockCount: 24 },
    "med-ibuprofen": { price: 10200, stockCount: 20 },
    "med-ketonal": { price: 29800, stockCount: 10 },
    "med-vitaminc": { price: 22500, stockCount: 33 },
    "med-vitamind": { price: 91000, stockCount: 8 },
    "med-aspirin": { price: 33500, stockCount: 18 },
    "med-enalapril": { price: 15000, stockCount: 14 },
  },
  "branch-mirzo-ulugbek": {
    "med-paracetamol": { price: 6400, stockCount: 96 },
    "med-amoxicillin": { price: 17900, stockCount: 40 },
    "med-azithromycin": { price: 23900, stockCount: 26 },
    "med-omeprazole": { price: 11800, stockCount: 58 },
    "med-ciprofloxacin": { price: 18900, stockCount: 28 },
    "med-loratadine": { price: 7500, stockCount: 58 },
    "med-ibuprofen": { price: 9500, stockCount: 70 },
    "med-ketonal": { price: 27200, stockCount: 34 },
    "med-vitaminc": { price: 20500, stockCount: 74 },
    "med-vitamind": { price: 87000, stockCount: 21 },
    "med-aspirin": { price: 31000, stockCount: 50 },
    "med-enalapril": { price: 13800, stockCount: 31 },
  },
  "branch-sergeli": {
    "med-paracetamol": { price: 6700, stockCount: 35 },
    "med-amoxicillin": { price: 18800, stockCount: 8 },
    "med-azithromycin": { price: 24800, stockCount: 5 },
    "med-omeprazole": { price: 12600, stockCount: 17 },
    "med-ciprofloxacin": { price: 20100, stockCount: 6 },
    "med-loratadine": { price: 7900, stockCount: 18 },
    "med-ibuprofen": { price: 9900, stockCount: 16 },
    "med-ketonal": { price: 28900, stockCount: 9 },
    "med-vitaminc": { price: 21800, stockCount: 22 },
    "med-vitamind": { price: 90000, stockCount: 4 },
    "med-aspirin": { price: 32500, stockCount: 12 },
    "med-enalapril": { price: 14500, stockCount: 7 },
  },
};

export const MOCK_MEDICINES = CATALOG;

export function getMockCategories() {
  return MOCK_CATEGORIES.map((category) => ({
    ...category,
    medicineCount: CATALOG.filter((item) => item.categoryId === category.id).length,
  }));
}

export function getMockMedicines(branchId, search = "", categoryId = "") {
  const overlay = STOCK_BY_BRANCH[branchId] || {};
  const needle = String(search).trim().toLowerCase();

  return CATALOG.filter((medicine) => {
    const matchesCategory = !categoryId || medicine.categoryId === categoryId;
    const categoryName = MOCK_CATEGORIES.find((item) => item.id === medicine.categoryId)?.name || "";
    const matchesSearch =
      !needle ||
      medicine.name.toLowerCase().includes(needle) ||
      medicine.description.toLowerCase().includes(needle) ||
      categoryName.toLowerCase().includes(needle);
    return matchesCategory && matchesSearch;
  }).map((medicine) => {
    const stock = overlay[medicine.id];
    return {
      ...medicine,
      price: stock?.price ?? medicine.price,
      stockCount: stock?.stockCount ?? medicine.stockCount,
    };
  });
}

export function unitMultiplier(unit) {
  return unit === "pachka" ? 10 : 1;
}

export function lineTotal(item) {
  const price = item.medicine?.price ?? item.unitPrice ?? 0;
  const qty = item.quantity || 0;
  return price * unitMultiplier(item.selectedUnit) * qty;
}
