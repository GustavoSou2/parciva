import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const EXTENSIONS = [".ts", ".tsx", ".css"];
const HEX_LITERAL = /#[0-9a-fA-F]{6}/;

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path));
    } else if (EXTENSIONS.includes(entry.slice(entry.lastIndexOf(".")))) {
      files.push(path);
    }
  }
  return files;
}

const offenses = [];
for (const file of listFiles(ROOT)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (HEX_LITERAL.test(line)) {
      offenses.push(`${file}:${index + 1}:${line.trim()}`);
    }
  });
}

if (offenses.length > 0) {
  console.error("Hex literal encontrado fora de design/ — use os tokens:\n" + offenses.join("\n"));
  process.exit(1);
}
