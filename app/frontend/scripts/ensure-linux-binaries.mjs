import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const linuxBins = [
  "@rollup/rollup-linux-x64-gnu@4.62.5",
  "@tailwindcss/oxide-linux-x64-gnu@4.3.3",
  "lightningcss-linux-x64-gnu@1.32.0",
];

function packageName(spec) {
  return spec.slice(0, spec.lastIndexOf("@"));
}

function resolvePackage(name) {
  try {
    return require.resolve(`${name}/package.json`);
  } catch {
    try {
      return require.resolve(name);
    } catch {
      return null;
    }
  }
}

function installInto(cwd, specs) {
  const result = spawnSync(
    "npm",
    [
      "install",
      ...specs,
      "--no-save",
      "--no-package-lock",
      "--include=optional",
      "--workspaces=false",
      "--install-strategy=nested",
    ],
    {
      cwd,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        npm_config_optional: "true",
        npm_config_workspaces: "false",
      },
    },
  );
  return result.status ?? 1;
}

function copyResolvedPackage(name) {
  const resolved = resolvePackage(name);
  if (!resolved) return false;

  const sourceDir = path.dirname(resolved);
  const destDir = path.join(frontendRoot, "node_modules", ...name.split("/"));
  if (path.resolve(sourceDir) === path.resolve(destDir)) return true;

  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true });
  return true;
}

if (process.platform !== "linux" || process.arch !== "x64") {
  process.exit(0);
}

const missing = linuxBins.filter((spec) => !resolvePackage(packageName(spec)));
if (missing.length > 0) {
  const status = installInto(frontendRoot, missing);
  if (status !== 0) process.exit(status);
}

for (const spec of linuxBins) {
  const name = packageName(spec);
  if (!copyResolvedPackage(name)) {
    const status = installInto(frontendRoot, [spec]);
    if (status !== 0 || !copyResolvedPackage(name)) {
      console.error(`Failed to install ${spec} for Vercel Linux build`);
      process.exit(1);
    }
  }
}

const rollupDir = path.join(frontendRoot, "node_modules", "rollup");
const rollupNative = path.join(frontendRoot, "node_modules", "@rollup", "rollup-linux-x64-gnu");
if (fs.existsSync(rollupDir) && fs.existsSync(rollupNative)) {
  const nestedDir = path.join(rollupDir, "node_modules", "@rollup", "rollup-linux-x64-gnu");
  fs.mkdirSync(path.dirname(nestedDir), { recursive: true });
  fs.cpSync(rollupNative, nestedDir, { recursive: true });
}
