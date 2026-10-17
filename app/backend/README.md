# Vita24 backend

Express (CommonJS) + Prisma + PostgreSQL. Navbat va zaxira muddati `setInterval` worker orqali tekshiriladi. Redis va BullMQ yo'q.

## Ma'lumotlar bazasi

Lokal Windows klasteri `app/backend/.postgres` ichida. Ishga tushirish:

```bash
npm run db:start
npm run db:stop
```

`db:start` / `db:stop` `pg_ctl` ni platformaga qarab chaqiradi. Docker ixtiyoriy: `npm run db:up`.

## Muhim muhit o'zgaruvchilari

`JWT_SECRET` va `LEKKO_KEY_SECRET` kamida 32 belgi, `change-me` bo'lmasin. Server aks holda to'xtaydi. LEKKO kaliti bazada AES-GCM (`enc:v1:`) bilan saqlanadi.

Seed parollari `SEED_ADMIN_PASSWORD` va `SEED_PHARMACIST_PASSWORD` dan olinadi va konsolga chiqmaydi.

Mijoz OTP kodi `TELEGRAM_BOT_TOKEN` bo'lsa shu telefonning Telegram chatiga ketadi va javobda ko'rinmaydi. Birinchi marta botda kontakt yuboriladi. Token yo'qida, productiondan tashqari, javobda `devCode` qoladi.

Retseptlar `private/prescriptions` da. Eski base64 yozuvlar:

```bash
npm run db:migrate-prescriptions
```
