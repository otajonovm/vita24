ALTER TABLE "Order" ADD COLUMN "checkoutRules" JSONB;

CREATE TABLE "ShopSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 15000,
    "freeDeliveryFrom" DECIMAL(12,2) NOT NULL DEFAULT 200000,
    "reviewWindowMinutes" INTEGER NOT NULL DEFAULT 120,
    "paymentWindowMinutes" INTEGER NOT NULL DEFAULT 15,
    "paymeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "clickEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cashEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramBotToken" TEXT,
    "messageTemplates" JSONB NOT NULL,
    "contactPhone" TEXT NOT NULL DEFAULT '1095',
    "contactPhoneAlt" TEXT NOT NULL DEFAULT '+998 71 200 24 24',
    "footerAbout" TEXT NOT NULL,
    "footerLicensed" TEXT NOT NULL,
    "footerShort" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ShopSetting" (
    "id",
    "messageTemplates",
    "footerAbout",
    "footerLicensed",
    "footerShort"
) VALUES (
    'default',
    '{"otp":"Vita24 tasdiqlash kodi: {{code}}\nTelefon: {{phone}}\nSaytga qaytib shu kodni kiriting. Kod 5 daqiqa amal qiladi.","askContact":"Kodni olish uchun Telegramdagi telefon raqamingizni yuboring. Kod shu chatga keladi, keyin saytga qaytib kiriting.","PAID":"To''lovingiz qabul qilindi","PREPARING":"Buyurtmangiz yig''ilmoqda","READY":"Buyurtmangiz tayyor","DELIVERING":"Buyurtmangiz yo''lda","COMPLETED":"Buyurtmangiz yetkazildi","CANCELLED":"Buyurtmangiz bekor qilindi","WAITING_PAYMENT":"Retsept tasdiqlandi, to''lovni amalga oshiring"}'::jsonb,
    'Ko''p filialli onlayn dorixona. 24/7 buyurtma va farmatsevt nazorati.',
    'Litsenziyalangan dorixona tarmog''i',
    '24/7 onlayn dorixona. Filial tanlang, zaxira qiling, farmatsevt tasdig''idan so''ng to''lang.'
);
