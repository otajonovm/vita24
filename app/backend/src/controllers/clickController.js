const { sendError } = require("../lib/response");

function gatewayDisabled(_req, res) {
  return sendError(
    res,
    503,
    "PAYMENT_GATEWAY_DISABLED",
    "Click/Payme hozircha ulanmagan. Idempotent to'lov: POST /api/orders/:id/mock-pay"
  );
}

module.exports = {
  prepare: gatewayDisabled,
  complete: gatewayDisabled,
};
