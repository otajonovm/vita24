import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const linuxBins = [
  "@rollup/rollup-linux-x64-gnu@4.62.5",
  "@tailwindcss/oxide-linux-x64-gnu@4.3.3",
  "lightningcss-linux-x64-gnu@1.32.0",
];

if (process.platform !== "linux" || process.arch !== "x64") {
  process.exit(0);
}

const missing = linuxBins.filter((spec) => {
  const name = spec.slice(0, spec.lastIndexOf("@"));
  try {
    require.resolve(name);
    return false;
  } catch {
    return true;
  }
});

if (missing.length === 0) {
  process.exit(0);
}

const result = spawnSync(
  "npm",
  ["install", ...missing, "--no-save", "--no-package-lock", "--include=optional"],
  {
    cwd: frontendRoot,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      npm_config_optional: "true",
    },
  },
);

process.exit(result.status ?? 1);
