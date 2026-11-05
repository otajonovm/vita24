# Vita24 Search — P0+P1 (2026-11-05)

## O'zgarishlar
- **P0.1** `CatalogPage`: filialsiz `/catalog?q=...` crash yo'q (`branch?.id`); banner + BranchModal.
- **P0.2** `mapMedicine` → `minPrice`/`priceFrom`; `normalizeMedicine` null ni 0 qilmaydi; UI "… so'm dan" / "Filial tanlang".
- **P0.3** Ranking: stock>0 avval; brand prefix → ingredient analog; suggest da "O'xshash / analoglar".
- **P0.4** Suggestion panel `absolute` (input yopilmaydi); debounce 180ms; skeleton; Clear (X); stale "topilmadi" yo'q.
- **P0.5** Empty: did-you-mean, popular, kategoriya, Telegram/telefon CTA; zero-result log; thumbnail + "+".
- **P1.1–4** QWERTY↔ЙЦУКЕН; adjacent swap; ingredient→brand; symptom+canonical boost.
- **P1.5–6** Popular typo/script filter; kartada doza/stock/minPrice.

## Acceptance
| So'rov | Natija |
|--------|--------|
| paracetamol / kbd / nuorfen / nuro / дротаверин / yo'tal / oshqozon | top oila ✓ |
| xyzqwe | bo'sh + suggestions/popular ✓ |
| Filialsiz catalog?q= | crash yo'q, minPrice ✓ |

## Test
- `npm test` (node:test) + `npx jest jest/searchSmart.test.js` — o'tdi.

## P2 (keyingi)
1. Ovozli qidiruv (Web Speech API).
2. Postgres `search_vector` / weighted FTS.
3. Zero-result digest (admin email/Telegram).
4. LEKKO `activeIngredient` backfill.
5. Filiallararo "qayerda bor" xarita.
