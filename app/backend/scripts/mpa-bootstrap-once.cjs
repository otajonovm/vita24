/**
 * Production bir martalik MPA bootstrap (Railway volume flag).
 *   node scripts/mpa-bootstrap-once.cjs
 * Flag: $DATA_DIR/mpa-bootstrap-done
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { dataPath } = require("../src/lib/dataDir");

const flag = dataPath("mpa-bootstrap-done");
const force = process.argv.includes("--force");

function run(cmd, args) {
  console.log(`[mpa-bootstrap] > ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exit=${result.status}`);
  }
}

async function main() {
  if (!force && fs.existsSync(flag)) {
    console.log(`[mpa-bootstrap] skip — flag bor: ${flag}`);
    return;
  }

  fs.mkdirSync(path.dirname(flag), { recursive: true });
  run("npx", ["prisma", "migrate", "deploy"]);
  run("npm", ["run", "mpa:sync"]);
  run("npm", ["run", "rx:match", "--", "--apply"]);
  run("npm", ["run", "mpa:images", "--", "--apply"]);
  fs.writeFileSync(flag, new Date().toISOString(), "utf8");
  console.log(`[mpa-bootstrap] done → ${flag}`);
}

main().catch((error) => {
  console.error("[mpa-bootstrap] failed", error);
  process.exit(1);
});
