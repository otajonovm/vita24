const prisma = require("../lib/prisma");
const { asyncHandler, sendSuccess } = require("../lib/response");
const { writeAudit } = require("../lib/audit");
const {
  getShopSettings,
  publicShopSettings,
  adminShopSettings,
  saveShopSettings,
} = require("../lib/shopSettings");

const publicSettings = asyncHandler(async (req, res) => {
  const settings = await getShopSettings();
  return sendSuccess(res, publicShopSettings(settings), "Sozlamalar");
});

const getAdminSettings = asyncHandler(async (req, res) => {
  const settings = await getShopSettings();
  return sendSuccess(res, adminShopSettings(settings), "Sozlamalar");
});

function settingsAudit(view) {
  const { telegramToken, ...rest } = view;
  return rest;
}

const updateAdminSettings = asyncHandler(async (req, res) => {
  const before = settingsAudit(adminShopSettings(await getShopSettings()));
  const saved = await saveShopSettings(req.body);
  const after = settingsAudit(adminShopSettings(saved));
  await writeAudit(prisma, {
    req,
    action: "SETTINGS_UPDATED",
    entityType: "ShopSetting",
    entityId: "default",
    summary: `Yetkazish ${saved.deliveryFee}, bepul ${saved.freeDeliveryFrom}`,
    before,
    after,
  });
  return sendSuccess(res, adminShopSettings(saved), "Sozlamalar saqlandi");
});

module.exports = {
  publicSettings,
  getAdminSettings,
  updateAdminSettings,
};
