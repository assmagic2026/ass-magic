import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(projectRoot, ".cloudflare-pages");
const maximumAssetBytes = 25 * 1024 * 1024;
const excludedTopLevelEntries = new Set([
  ".cloudflare-pages",
  ".git",
  ".github",
  ".wrangler",
  "functions",
  "scripts",
]);

function toSitePath(filePath) {
  return relative(projectRoot, filePath).split(sep).join("/");
}

async function copyDeployableEntry(sourcePath) {
  const sitePath = toSitePath(sourcePath);
  const topLevelEntry = sitePath.split("/")[0];
  if (excludedTopLevelEntries.has(topLevelEntry)) return;

  const sourceStat = await stat(sourcePath);
  if (sourceStat.isDirectory()) {
    const entries = await readdir(sourcePath, { withFileTypes: true });
    await Promise.all(entries.map((entry) => copyDeployableEntry(join(sourcePath, entry.name))));
    return;
  }
  if (!sourceStat.isFile() || sourcePath.endsWith(`${sep}.DS_Store`)) return;
  if (sourceStat.size > maximumAssetBytes) {
    console.log(`[cloudflare-pages] external asset: ${sitePath}`);
    return;
  }

  const destinationPath = join(outputRoot, sitePath);
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const rootEntries = await readdir(projectRoot, { withFileTypes: true });
await Promise.all(rootEntries.map((entry) => copyDeployableEntry(join(projectRoot, entry.name))));
console.log(`[cloudflare-pages] output ready: ${outputRoot}`);
