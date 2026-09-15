import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Include supplied license files for every production dependency, including
// Markdown's transitive packages, in the distributed static build.
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const notices = [];
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path || metadata.dev) continue;
  const files = readdirSync(path).filter((name) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
  );
  if (!files.length) throw new Error(`Missing supplied license: ${path}`);
  notices.push(
    `## ${path.replace(/^node_modules\//, "")} ${metadata.version}\n\n${files.map((name) => readFileSync(resolve(path, name), "utf8")).join("\n\n")}`,
  );
}
writeFileSync(
  "public/licenses/runtime-dependencies.txt",
  notices.join("\n\n--------------------\n\n"),
);
console.log(
  `Collected supplied notices for ${notices.length} runtime packages.`,
);
