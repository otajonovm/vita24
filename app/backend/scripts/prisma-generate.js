/**
 * Windows: running node/nodemon locks query_engine-windows.dll.node,
 * so `prisma generate` fails with EPERM on rename.
 * This script frees Vita24 backend processes, then generates the client.
 */
const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const enginePath = path.join(
  root,
  "generated",
  "prisma",
  "query_engine-windows.dll.node"
);

function listNodePids() {
  const ps = `
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object {
        $_.CommandLine -and (
          $_.CommandLine -match 'Vita24\\\\app\\\\backend' -or
          $_.CommandLine -match 'nodemon' -and $_.CommandLine -match 'Vita24' -or
          ($_.CommandLine -match 'server\\.js' -and $_.CommandLine -match 'Vita24')
        )
      } |
      ForEach-Object { $_.ProcessId }
  `;
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-Command", ps],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return [];
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function stopBackendLocks() {
  const pids = listNodePids();
  for (const pid of pids) {
    try {
      process.kill(pid);
      console.log(`[prisma-generate] to'xtatildi PID ${pid}`);
    } catch {
      // already gone
    }
  }
  if (pids.length) {
    // Windows unlock delay
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  }
}

function cleanTmpEngines() {
  const dir = path.dirname(enginePath);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("query_engine-windows.dll.node.tmp")) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        // ignore
      }
    }
  }
}

function generate() {
  execSync("npx prisma generate", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

stopBackendLocks();
cleanTmpEngines();

try {
  generate();
  console.log("[prisma-generate] muvaffaqiyatli");
} catch (error) {
  console.error(
    "\n[prisma-generate] EPERM qayta chiqsa: Task Manager dan barcha node.exe ni yoping, keyin qayta urinib ko'ring.\n"
  );
  process.exit(error.status || 1);
}
