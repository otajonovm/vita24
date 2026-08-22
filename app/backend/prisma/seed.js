const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const branches = [
  {
    id: "branch-chilonzor",
    name: "Vita24 Chilonzor",
    slug: "chilonzor",
    address: "Bunyodkor shoh ko'chasi 7, Chilonzor tumani",
    phone: "+998 71 200 24 01",
    district: "Chilonzor",
    workingHours: "24/7",
  },
  {
    id: "branch-yunusobod",
    name: "Vita24 Yunusobod",
    slug: "yunusobod",
    address: "Amir Temur shoh ko'chasi 108, Yunusobod tumani",
    phone: "+998 71 200 24 02",
    district: "Yunusobod",
    workingHours: "08:00–23:00",
  },
  {
    id: "branch-mirzo-ulugbek",
    name: "Vita24 Mirzo Ulug'bek",
    slug: "mirzo-ulugbek",
    address: "Buyuk Ipak Yo'li 123, Mirzo Ulug'bek tumani",
    phone: "+998 71 200 24 03",
    district: "Mirzo Ulug'bek",
    workingHours: "24/7",
  },
  {
    id: "branch-sergeli",
    name: "Vita24 Sergeli",
    slug: "sergeli",
    address: "Yangihayot yo'li 45, Sergeli tumani",
    phone: "+998 71 200 24 04",
    district: "Sergeli",
    workingHours: "08:00–22:00",
  },
];

const categories = [
  { id: "cat-pain", name: "Og'riq qoldiruvchilar", slug: "ogriq", icon: "💊", sortOrder: 1 },
  { id: "cat-antibiotic", name: "Antibiotiklar", slug: "antibiotiklar", icon: "🧬", sortOrder: 2 },
  { id: "cat-cardio", name: "Yurak-qon tomir", slug: "yurak", icon: "❤️", sortOrder: 3 },
  { id: "cat-vitamin", name: "Vitaminlar", slug: "vitaminlar", icon: "🍋", sortOrder: 4 },
  { id: "cat-kids", name: "Bolalar uchun", slug: "bolalar", icon: "👶", sortOrder: 5 },
  { id: "cat-allergy", name: "Allergiya", slug: "allergiya", icon: "🌿", sortOrder: 6 },
];

const medicines = [
  {
    id: "med-paracetamol",
    name: "Paracetamol 500 mg",
    slug: "paracetamol-500",
    description: "Isitma va bosh og'rig'iga qarshi, retseptsiz.",
    manufacturer: "Nika Pharm",
    dosageForm: "Tabletka",
    isPrescription: false,
    imageEmoji: "💊",
    categoryId: "cat-pain",
  },
  {
    id: "med-ibuprofen",
    name: "Ibuprofen 400 mg",
    slug: "ibuprofen-400",
    description: "Yallig'lanish va og'riqni kamaytiradi.",
    manufacturer: "Jurabek Laboratories",
    dosageForm: "Tabletka",
    isPrescription: false,
    imageEmoji: "🔵",
    categoryId: "cat-pain",
  },
  {
    id: "med-amoxicillin",
    name: "Amoksitsillin 500 mg",
    slug: "amoksitsillin-500",
    description: "Keng spektrli antibiotik. Retsept talab qilinadi.",
    manufacturer: "Nobel Pharmsanoat",
    dosageForm: "Kapsula",
    isPrescription: true,
    imageEmoji: "🧫",
    categoryId: "cat-antibiotic",
  },
  {
    id: "med-azithromycin",
    name: "Azitromitsin 500 mg",
    slug: "azitromitsin-500",
    description: "Nafas yo'llari infeksiyalarida qo'llanadi. Retseptli.",
    manufacturer: "Remedy Group",
    dosageForm: "Tabletka",
    isPrescription: true,
    imageEmoji: "🧪",
    categoryId: "cat-antibiotic",
  },
  {
    id: "med-ciprofloxacin",
    name: "Tsiprofloksatsin 500 mg",
    slug: "tsiprofloksatsin-500",
    description: "Siydik yo'llari infeksiyalarida qo'llanadi. Retseptli.",
    manufacturer: "KRKA",
    dosageForm: "Tabletka",
    isPrescription: true,
    imageEmoji: "🧬",
    categoryId: "cat-antibiotic",
  },
  {
    id: "med-aspirin",
    name: "Aspirin Kardio 100 mg",
    slug: "aspirin-kardio-100",
    description: "Yurak-qon tomir profilaktikasi uchun past doza.",
    manufacturer: "Bayer",
    dosageForm: "Tabletka",
    isPrescription: false,
    imageEmoji: "❤️",
    categoryId: "cat-cardio",
  },
  {
    id: "med-enalapril",
    name: "Enalapril 10 mg",
    slug: "enalapril-10",
    description: "Qon bosimini tushirish uchun. Retseptli.",
    manufacturer: "Darnitsa",
    dosageForm: "Tabletka",
    isPrescription: true,
    imageEmoji: "🫀",
    categoryId: "cat-cardio",
  },
  {
    id: "med-vitaminc",
    name: "Vitamin C 1000 mg",
    slug: "vitamin-c-1000",
    description: "Immunitetni qo'llab-quvvatlovchi askorbin kislota.",
    manufacturer: "Evalar",
    dosageForm: "Shishadigan tabletka",
    isPrescription: false,
    imageEmoji: "🍊",
    categoryId: "cat-vitamin",
  },
  {
    id: "med-vitamind",
    name: "Vitamin D3 2000 IU",
    slug: "vitamin-d3-2000",
    description: "Suyak va immunitet uchun kunlik D3.",
    manufacturer: "Solgar",
    dosageForm: "Kapsula",
    isPrescription: false,
    imageEmoji: "☀️",
    categoryId: "cat-vitamin",
  },
  {
    id: "med-nurofen",
    name: "Nurofen sirop 100 mg/5 ml",
    slug: "nurofen-sirop",
    description: "Bolalar uchun ibuprofen siropi, 3 oylikdan.",
    manufacturer: "Reckitt",
    dosageForm: "Sirop",
    isPrescription: false,
    imageEmoji: "🍼",
    categoryId: "cat-kids",
  },
  {
    id: "med-panadol",
    name: "Panadol Baby",
    slug: "panadol-baby",
    description: "Isitma tushiruvchi bolalar suspenziyasi.",
    manufacturer: "GSK",
    dosageForm: "Suspenziya",
    isPrescription: false,
    imageEmoji: "👶",
    categoryId: "cat-kids",
  },
  {
    id: "med-loratadine",
    name: "Loratadin 10 mg",
    slug: "loratadin-10",
    description: "Mavsumiy allergiya va toshmaga qarshi.",
    manufacturer: "Nika Pharm",
    dosageForm: "Tabletka",
    isPrescription: false,
    imageEmoji: "🌼",
    categoryId: "cat-allergy",
  },
];

const stockByBranch = {
  "branch-chilonzor": {
    "med-paracetamol": { price: 6500, stockCount: 80 },
    "med-ibuprofen": { price: 9800, stockCount: 54 },
    "med-amoxicillin": { price: 18500, stockCount: 30 },
    "med-azithromycin": { price: 24600, stockCount: 18 },
    "med-ciprofloxacin": { price: 19800, stockCount: 20 },
    "med-aspirin": { price: 32000, stockCount: 40 },
    "med-enalapril": { price: 14200, stockCount: 22 },
    "med-vitaminc": { price: 21000, stockCount: 60 },
    "med-vitamind": { price: 89000, stockCount: 16 },
    "med-nurofen": { price: 42000, stockCount: 25 },
    "med-panadol": { price: 28500, stockCount: 28 },
    "med-loratadine": { price: 7800, stockCount: 45 },
  },
  "branch-yunusobod": {
    "med-paracetamol": { price: 6900, stockCount: 42 },
    "med-ibuprofen": { price: 10200, stockCount: 20 },
    "med-amoxicillin": { price: 19200, stockCount: 12 },
    "med-azithromycin": { price: 25100, stockCount: 9 },
    "med-ciprofloxacin": { price: 20500, stockCount: 11 },
    "med-aspirin": { price: 33500, stockCount: 18 },
    "med-enalapril": { price: 15000, stockCount: 14 },
    "med-vitaminc": { price: 22500, stockCount: 33 },
    "med-vitamind": { price: 91000, stockCount: 8 },
    "med-nurofen": { price: 43500, stockCount: 11 },
    "med-panadol": { price: 29000, stockCount: 15 },
    "med-loratadine": { price: 8100, stockCount: 24 },
  },
  "branch-mirzo-ulugbek": {
    "med-paracetamol": { price: 6400, stockCount: 96 },
    "med-ibuprofen": { price: 9500, stockCount: 70 },
    "med-amoxicillin": { price: 17900, stockCount: 40 },
    "med-azithromycin": { price: 23900, stockCount: 26 },
    "med-ciprofloxacin": { price: 18900, stockCount: 28 },
    "med-aspirin": { price: 31000, stockCount: 50 },
    "med-enalapril": { price: 13800, stockCount: 31 },
    "med-vitaminc": { price: 20500, stockCount: 74 },
    "med-vitamind": { price: 87000, stockCount: 21 },
    "med-nurofen": { price: 41000, stockCount: 34 },
    "med-panadol": { price: 27000, stockCount: 38 },
    "med-loratadine": { price: 7500, stockCount: 58 },
  },
  "branch-sergeli": {
    "med-paracetamol": { price: 6700, stockCount: 35 },
    "med-ibuprofen": { price: 9900, stockCount: 16 },
    "med-amoxicillin": { price: 18800, stockCount: 8 },
    "med-azithromycin": { price: 24800, stockCount: 5 },
    "med-ciprofloxacin": { price: 20100, stockCount: 6 },
    "med-aspirin": { price: 32500, stockCount: 12 },
    "med-enalapril": { price: 14500, stockCount: 7 },
    "med-vitaminc": { price: 21800, stockCount: 22 },
    "med-vitamind": { price: 90000, stockCount: 4 },
    "med-nurofen": { price: 42800, stockCount: 9 },
    "med-panadol": { price: 28800, stockCount: 10 },
    "med-loratadine": { price: 7900, stockCount: 18 },
  },
};

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.order.deleteMany();
  await prisma.branchStock.deleteMany();
  await prisma.medicine.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();

  for (const category of categories) {
    await prisma.category.create({ data: category });
  }

  for (const medicine of medicines) {
    await prisma.medicine.create({ data: medicine });
  }

  for (const branch of branches) {
    await prisma.branch.create({ data: branch });
  }

  for (const [branchId, stocks] of Object.entries(stockByBranch)) {
    for (const [medicineId, stock] of Object.entries(stocks)) {
      await prisma.branchStock.create({
        data: {
          branchId,
          medicineId,
          price: stock.price,
          stockCount: stock.stockCount,
          reservedCount: 0,
        },
      });
    }
  }

  const rxCount = medicines.filter((item) => item.isPrescription).length;
  console.log(
    `Vita24 seed yuklandi: ${branches.length} filial, ${categories.length} toifa, ${medicines.length} dori (${rxCount} retseptli)`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
