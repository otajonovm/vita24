const { asyncHandler, sendSuccess } = require("../lib/response");
const { subscribe } = require("../lib/panelEvents");
const { removeUploadedFile } = require("../middlewares/upload");
const {
  createCourier,
  createHandover,
  deliverOrder,
  failOrder,
  listBranchCouriers,
  listCourierOrders,
  listHandovers,
  pickupOrder,
  settleHandover,
  shiftSummary,
  updateCourier,
} = require("../services/courierService");

const listOrders = asyncHandler(async (req, res) => {
  const scope = req.query.scope === "history" ? "history" : "active";
  const orders = await listCourierOrders(req.user.id, scope);
  return sendSuccess(res, { orders, scope });
});

const pickup = asyncHandler(async (req, res) => {
  const order = await pickupOrder({ orderId: req.params.id, user: req.user, req });
  return sendSuccess(res, order, "Buyurtma olindi");
});

const deliver = asyncHandler(async (req, res) => {
  const receiptGiven = req.body.receiptGiven === true || req.body.receiptGiven === "true" || req.body.receiptGiven === "1";
  const photoPath = req.file ? `/uploads/delivery-proofs/${req.file.filename}` : null;
  try {
    const order = await deliverOrder({
      orderId: req.params.id,
      user: req.user,
      req,
      proof: {
        method: req.body.method,
        collectedAmount: req.body.collectedAmount,
        receiptGiven,
        photoPath,
      },
    });
    return sendSuccess(res, order, "Buyurtma yetkazildi");
  } catch (error) {
    if (req.file) removeUploadedFile(req.file.path);
    throw error;
  }
});

const fail = asyncHandler(async (req, res) => {
  const order = await failOrder({
    orderId: req.params.id,
    user: req.user,
    req,
    reason: { code: req.body.reason, note: req.body.note },
  });
  return sendSuccess(res, order, "Yetkazib bo'lmadi");
});

const shift = asyncHandler(async (req, res) => {
  return sendSuccess(res, await shiftSummary(req.user.id));
});

const handover = asyncHandler(async (req, res) => {
  const created = await createHandover({
    courierId: req.user.id,
    orderIds: req.body.orderIds,
    amount: req.body.amount,
  });
  return sendSuccess(res, created, "Topshirish so'rovi yuborildi");
});

const stream = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ courierId: req.user.id })}\n\n`);
  const stop = subscribe(`courier:${req.user.id}`, res);
  const beat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);
  req.on("close", () => {
    clearInterval(beat);
    stop();
  });
});

const listCouriers = asyncHandler(async (req, res) => {
  const couriers = await listBranchCouriers(req.user.branchId);
  return sendSuccess(res, { couriers });
});

const postCourier = asyncHandler(async (req, res) => {
  const courier = await createCourier({ branchId: req.user.branchId, body: req.body, req });
  return sendSuccess(res, courier, "Kuryer qo'shildi");
});

const patchCourier = asyncHandler(async (req, res) => {
  const courier = await updateCourier({
    branchId: req.user.branchId,
    courierId: req.params.id,
    body: req.body,
    req,
  });
  return sendSuccess(res, courier, "Kuryer yangilandi");
});

const getHandovers = asyncHandler(async (req, res) => {
  const handovers = await listHandovers(req.user.branchId);
  return sendSuccess(res, { handovers });
});

const confirmHandover = asyncHandler(async (req, res) => {
  const row = await settleHandover({
    id: req.params.id,
    branchId: req.user.branchId,
    user: req.user,
    req,
    mode: "confirm",
    note: req.body.note,
  });
  return sendSuccess(res, row, row.differenceFlagged ? "Summa farqi belgilandi" : "Topshirish tasdiqlandi");
});

const disputeHandover = asyncHandler(async (req, res) => {
  const row = await settleHandover({
    id: req.params.id,
    branchId: req.user.branchId,
    user: req.user,
    req,
    mode: "dispute",
    note: req.body.note,
  });
  return sendSuccess(res, row, "E'tiroz yozildi");
});

module.exports = {
  listOrders,
  pickup,
  deliver,
  fail,
  shift,
  handover,
  stream,
  listCouriers,
  postCourier,
  patchCourier,
  getHandovers,
  confirmHandover,
  disputeHandover,
};
