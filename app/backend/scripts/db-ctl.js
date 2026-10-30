const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, ".postgres", "data");
const binDir = path.join(root, ".postgres", "pgsql", "bin");
const pgCtlName = process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl";
const pgCtl = path.join(binDir, pgCtlName);
const action = process.argv[2];

if (!fs.existsSync(pgCtl)) {
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) process.exit(0);
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

function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  if (action === "start") {
    if (await portOpen(5432)) {
      console.log("PostgreSQL allaqachon 5432-portda ishlayapti");
      process.exit(0);
      return;
    }
    const child = spawn(
      pgCtl,
      ["-D", dataDir, "-l", path.join(root, ".postgres", "postgres.log"), "start"],
      { stdio: "inherit" }
    );
    child.on("exit", (code) => process.exit(code || 0));
    return;
  }

  const status = spawnSync(pgCtl, ["-D", dataDir, "status"], { encoding: "utf8" });
  if (status.status !== 0 && !(await portOpen(5432))) {
    console.log("PostgreSQL allaqachon to'xtagan");
    process.exit(0);
    return;
  }
  const child = spawn(pgCtl, ["-D", dataDir, "stop"], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code || 0));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
