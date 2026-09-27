import { readFile, writeFile } from "node:fs/promises";

const lockfileUrl = new URL("../package-lock.json", import.meta.url);
const internalPrefix = "http://package-firewall.replit.internal/npm/";
const publicPrefix = "https://registry.npmjs.org/";
const dryRun = process.argv.includes("--dry-run");

const lockfile = JSON.parse(await readFile(lockfileUrl, "utf8"));
let normalizedCount = 0;

for (const entry of Object.values(lockfile.packages ?? {})) {
  if (typeof entry.resolved !== "string" || !entry.resolved.startsWith(internalPrefix)) {
    continue;
  }

  entry.resolved = `${publicPrefix}${entry.resolved.slice(internalPrefix.length)}`;
  normalizedCount += 1;
}

if (normalizedCount > 0 && !dryRun) {
  await writeFile(lockfileUrl, `${JSON.stringify(lockfile, null, 2)}\n`);
}

if (normalizedCount === 0) {
  console.log("No Replit-only package URLs found in package-lock.json.");
} else if (dryRun) {
  console.log(`Would normalize ${normalizedCount} Replit-only package URLs; dry run made no changes.`);
} else {
  console.log(`Normalized ${normalizedCount} Replit-only package URLs for this Render build.`);
}