# MPA dori reyestri integratsiyasi

Vita24 Lekko katalogiga MPA (mpa.uz / api.pharmagency.uz) ochiq reyestridan retsept belgisi va vaqtinchalik rasmlarni ulaydi.

> **Diqqat:** MPA API rasmiy hujjatlanmagan. Endpoint yoki maydonlar o‘zgarsa `app/backend/src/services/mpaClient.js` ni yangilang, `--limit` bilan dry-run qiling, keyin to‘liq sinxronni ishga tushiring.
>
> Hozirgi baza: `https://api.mpa.uz/drug-catalog-api/v2` (eski `api.pharmagency.uz` DNS dan o‘chirilgan).

## Buyruqlar tartibi (production)

Lokal yoki Railway shell’da, `app/backend` dan:

```bash
npm run mpa:sync                 # butun reyestr → RegistryDrug
npm run rx:match                 # dry-run hisobot (tmp/rx-match-report.*)
npm run rx:match -- --apply      # bazaga yozish
npm run mpa:images -- --dry-run  # qancha rasm topilishini ko‘rish
npm run mpa:images -- --apply    # yuklab PENDING saqlash
```

Foydali bayroqlar:

- `mpa:sync -- --limit 200 --dry-run` — sinov
- `mpa:sync -- --resume` — oxirgi sahifadan davom
- `rx:match -- --limit 100`
- `mpa:images -- --limit 50`

## Ustuvorlik

**Retsept:** `MANUAL` > `REGISTRY` > `RULE` / `LEKKO` > `DEFAULT`  
Moslashmagan yoki ishonchsiz → `isPrescription=true`, `rxSource=DEFAULT`, `rxNeedsReview=true`.

**Rasm:** `MANUAL` (farmatsevt/admin) > tasdiqlangan `REGISTRY` > shakl ikonkasi.  
`PENDING` / `REJECTED` MPA rasmi mijozga chiqmaydi. Lekko sinxroni `imageUrl` / `imageSource` / `registryDrugId` / `matchStatus` / `MANUAL` retseptni o‘zgartirmaydi.

## Admin

- Super admin: `/admin/registry` — moslashuv va rasm tekshiruvi
- Farmatsevt: `/branch-admin` omborida rasm yuklash (`capture` kameradan), filtrlar: MPA rasmi / rasmsiz

## Rasm texnikasi

MPA fayl API: **HEAD 401** qaytarishi mumkin — mavjudlikni HEAD bilan tekshirmang, faqat **GET**. Rasmlar hotlink qilinmaydi; lokal `uploads/medicines` ga saqlanadi (WebP, 800×800).
