const prisma = require("../src/lib/prisma");

const ROWS = [
  ["panadol", "paratsetamol", "BRAND"],
  ["efferalgan", "paratsetamol", "BRAND"],
  ["acetaminophen", "paratsetamol", "INGREDIENT"],
  ["парацетамол", "paratsetamol", "SPELLING"],
  ["paracetamol", "paratsetamol", "SPELLING"],
  ["paratsitamol", "paratsetamol", "SPELLING"],
  ["parasetamol", "paratsetamol", "SPELLING"],
  ["nurofen", "ibuprofen", "BRAND"],
  ["ибупрофен", "ibuprofen", "SPELLING"],
  ["ibuprofen", "ibuprofen", "SPELLING"],
  ["ibuprafen", "ibuprofen", "SPELLING"],
  ["amoxicillin", "amoksitsillin", "SPELLING"],
  ["amoksilin", "amoksitsillin", "SPELLING"],
  ["amoksiklav", "amoksitsillin", "BRAND"],
  ["flemoksin", "amoksitsillin", "BRAND"],
  ["амоксициллин", "amoksitsillin", "SPELLING"],
  ["sitramon", "paratsetamol", "BRAND"],
  ["цитрамон", "paratsetamol", "SPELLING"],
  ["analgin", "metamizol", "BRAND"],
  ["анальгин", "metamizol", "SPELLING"],
  ["metamizol", "metamizol", "INGREDIENT"],
  ["no-shpa", "drotaverin", "BRAND"],
  ["noshpa", "drotaverin", "SPELLING"],
  ["no shpa", "drotaverin", "SPELLING"],
  ["но-шпа", "drotaverin", "SPELLING"],
  ["drotaverin", "drotaverin", "INGREDIENT"],
  ["klaritin", "loratadin", "BRAND"],
  ["loratadin", "loratadin", "INGREDIENT"],
  ["лоратадин", "loratadin", "SPELLING"],
  ["omez", "omeprazol", "BRAND"],
  ["omeprazol", "omeprazol", "INGREDIENT"],
  ["омепразол", "omeprazol", "SPELLING"],
  ["aspirin", "atsetilsalitsil kislota", "BRAND"],
  ["аспирин", "atsetilsalitsil kislota", "SPELLING"],
  ["azithromycin", "azitromitsin", "SPELLING"],
  ["azitromitsin", "azitromitsin", "INGREDIENT"],
  ["ciprofloxacin", "tsiprofloksatsin", "SPELLING"],
  ["tsiprofloksatsin", "tsiprofloksatsin", "INGREDIENT"],
  ["эналаприл", "enalapril", "SPELLING"],
  ["vitamin c", "askorbin kislota", "INGREDIENT"],
  ["askorbin", "askorbin kislota", "INGREDIENT"],
  ["vitamin d", "kolekalsiferol", "INGREDIENT"],
  ["bosh og'rig'i", "paratsetamol", "SYMPTOM"],
  ["bosh og'rig'i", "ibuprofen", "SYMPTOM"],
  ["bosh og'rig'i", "sitramon", "SYMPTOM"],
  ["bosh ogrigi", "paratsetamol", "SYMPTOM"],
  ["bosh ogrigi", "ibuprofen", "SYMPTOM"],
  ["бош оғриғи", "paratsetamol", "SYMPTOM"],
  ["бош оғриғи", "ibuprofen", "SYMPTOM"],
  ["головная боль", "paratsetamol", "SYMPTOM"],
  ["головная боль", "ibuprofen", "SYMPTOM"],
  ["isitma", "paratsetamol", "SYMPTOM"],
  ["иситма", "paratsetamol", "SYMPTOM"],
  ["harorat", "paratsetamol", "SYMPTOM"],
  ["ҳарорат", "paratsetamol", "SYMPTOM"],
  ["температура", "paratsetamol", "SYMPTOM"],
  ["жар", "paratsetamol", "SYMPTOM"],
  ["yo'tal", "ambroksol", "SYMPTOM"],
  ["yoʻtal", "ambroksol", "SYMPTOM"],
  ["йўтал", "ambroksol", "SYMPTOM"],
  ["кашель", "ambroksol", "SYMPTOM"],
  ["tumov", "loratadin", "SYMPTOM"],
  ["тумов", "loratadin", "SYMPTOM"],
  ["насморк", "loratadin", "SYMPTOM"],
  ["shamollash", "paratsetamol", "SYMPTOM"],
  ["шамоллаш", "paratsetamol", "SYMPTOM"],
  ["простуда", "paratsetamol", "SYMPTOM"],
  ["allergiya", "loratadin", "SYMPTOM"],
  ["аллергия", "loratadin", "SYMPTOM"],
  ["oshqozon og'rig'i", "omeprazol", "SYMPTOM"],
  ["ошқозон оғриғи", "omeprazol", "SYMPTOM"],
  ["боль в желудке", "omeprazol", "SYMPTOM"],
  ["ich ketishi", "loperamid", "SYMPTOM"],
  ["ич кетиши", "loperamid", "SYMPTOM"],
  ["диарея", "loperamid", "SYMPTOM"],
  ["qon bosimi", "enalapril", "SYMPTOM"],
  ["қон босими", "enalapril", "SYMPTOM"],
  ["давление", "enalapril", "SYMPTOM"],
  ["uyqusizlik", "melatonin", "SYMPTOM"],
  ["уйқусизлик", "melatonin", "SYMPTOM"],
  ["бессонница", "melatonin", "SYMPTOM"],
  ["tish og'rig'i", "ibuprofen", "SYMPTOM"],
  ["tish og'rig'i", "paratsetamol", "SYMPTOM"],
  ["тиш оғриғи", "ibuprofen", "SYMPTOM"],
  ["зубная боль", "ibuprofen", "SYMPTOM"],
];

async function seedSearchSynonyms(client = prisma) {
  let upserts = 0;
  for (const [term, canonical, type] of ROWS) {
    await client.searchSynonym.upsert({
      where: { term_canonical_type: { term, canonical, type } },
      update: {},
      create: { term, canonical, type },
    });
    upserts += 1;
  }
  return upserts;
}

async function main() {
  const count = await seedSearchSynonyms();
  console.log(`Sinonimlar: ${count} ta upsert, jami ${await prisma.searchSynonym.count()}`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
}

module.exports = { seedSearchSynonyms, ROWS };
