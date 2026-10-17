const path = require("path");

const BACKEND_ROOT = path.join(__dirname, "../..");

/**
 * Persistent storage root. On Railway mount a volume at /data and set DATA_DIR=/data.
 * Locally defaults to the backend package directory.
 */
function dataRoot() {
  const fromEnv = String(process.env.DATA_DIR || "").trim();
  return fromEnv ? path.resolve(fromEnv) : BACKEND_ROOT;
}

function dataPath(...segments) {
  return path.join(dataRoot(), ...segments);
}

module.exports = { BACKEND_ROOT, dataRoot, dataPath };
