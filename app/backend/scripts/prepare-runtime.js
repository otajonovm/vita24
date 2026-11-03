const { spawnSync } = require("child_process");

const railway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const production = process.env.NODE_ENV === "production";

if (!railway && !production) {
  const db = spawnSync(process.execPath, ["scripts/db-ctl.js", "start"], { stdio: "inherit" });
  if (db.status) process.exit(db.status || 1);
}

const copy = spawnSync(process.execPath, ["scripts/copy-shared.js"], { stdio: "inherit" });
process.exit(copy.status || 0);
