const crypto = require("crypto");

function md5(value) {
  return crypto.createHash("md5").update(String(value), "utf8").digest("hex");
}

function buildClickSign({
  clickTransId,
  serviceId,
  secretKey,
  merchantTransId,
  merchantPrepareId,
  amount,
  action,
  signTime,
}) {
  const parts = [
    clickTransId,
    serviceId,
    secretKey,
    merchantTransId,
    action === 1 || action === "1" ? merchantPrepareId : null,
    amount,
    action,
    signTime,
  ].filter((part) => part !== null && part !== undefined);

  return md5(parts.join(""));
}

function clickSecrets() {
  return {
    serviceId: String(process.env.CLICK_SERVICE_ID || "").trim(),
    secretKey: String(process.env.CLICK_SECRET_KEY || "").trim(),
  };
}

function verifyClickSignature(body, action) {
  const { serviceId, secretKey } = clickSecrets();
  if (!serviceId || !secretKey) {
    return { ok: false, error: -1, error_note: "SIGN CHECK FAILED" };
  }

  const expected = buildClickSign({
    clickTransId: body.click_trans_id,
    serviceId,
    secretKey,
    merchantTransId: body.merchant_trans_id,
    merchantPrepareId: body.merchant_prepare_id,
    amount: body.amount,
    action,
    signTime: body.sign_time,
  });

  const given = String(body.sign_string || "");
  const valid =
    expected.length === given.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));

  if (!valid || String(body.service_id) !== serviceId) {
    return { ok: false, error: -1, error_note: "SIGN CHECK FAILED" };
  }

  return { ok: true };
}

function paymeCredentials() {
  return {
    merchantId: String(process.env.PAYME_MERCHANT_ID || "").trim(),
    key: String(process.env.PAYME_SECRET_KEY || "").trim(),
  };
}

function verifyPaymeAuth(header) {
  const { merchantId, key } = paymeCredentials();
  if (!merchantId || !key || !header || !header.startsWith("Basic ")) {
    return false;
  }

  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }

  const expected = `${merchantId}:${key}`;
  if (decoded.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(decoded), Buffer.from(expected));
}

module.exports = {
  buildClickSign,
  verifyClickSignature,
  verifyPaymeAuth,
  clickSecrets,
  paymeCredentials,
};
