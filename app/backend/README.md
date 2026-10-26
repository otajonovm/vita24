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

Mijoz OTP kodi `TELEGRAM_BOT_TOKEN` (yoki admin panelidagi token) bo'lsa shu telefonning Telegram chatiga ketadi va javobda ko'rinmaydi. Birinchi marta botda kontakt yuboriladi; `User.telegramChatId` bazada saqlanadi. Token yo'qida, productiondan tashqari, javobda `devCode` qoladi.

Telegram bot **grammy long polling** ishlatadi. Bitta bot tokenida bir vaqtning o'zida faqat **bitta** `getUpdates` polling bo'lishi mumkin. Backend'ni 2+ replica bilan ishlatmang (Railway `replicas=1`). Aks holda 409 Conflict chiqadi va OTP/yangilanishlar yo'qolishi mumkin. `WEBAPP_URL` https bo'lsa, bot menyusida Mini App ochiladi.

Retseptlar `private/prescriptions` da. Eski base64 yozuvlar:

```bash
npm run db:migrate-prescriptions
```
