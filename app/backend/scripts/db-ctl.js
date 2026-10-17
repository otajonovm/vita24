const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, ".postgres", "data");
const binDir = path.join(root, ".postgres", "pgsql", "bin");
const pgCtlName = process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl";
const pgCtl = path.join(binDir, pgCtlName);
const action = process.argv[2];

if (!fs.existsSync(pgCtl)) {
  console.error(
    "Lokal PostgreSQL topilmadi. Windowsda app/backend/.postgres/pgsql kerak. " +
      "Docker bo'lsa: npm run db:up"
  );
  process.exit(1);
}

if (action !== "start" && action !== "stop") {
  console.error("Ishlatish: node scripts/db-ctl.js start|stop");
  process.exit(1);
}

const args =
  action === "start"
    ? ["-D", dataDir, "-l", path.join(root, ".postgres", "postgres.log"), "start"]
    : ["-D", dataDir, "stop"];

const child = spawn(pgCtl, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code || 0));
