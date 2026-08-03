import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "artifacts",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".yml",
  ".yaml",
]);
const TEXT_FILES_WITHOUT_EXTENSION = new Set([
  ".gitignore",
  ".node-version",
  ".nvmrc",
]);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collect(absolute));
      continue;
    }
    if (
      entry.isFile() &&
      (
        TEXT_EXTENSIONS.has(path.extname(entry.name)) ||
        TEXT_FILES_WITHOUT_EXTENSION.has(entry.name)
      )
    ) {
      files.push(absolute);
    }
  }
  return files;
}

const failures = [];
const files = await collect(ROOT);
for (const file of files) {
  const relative = path.relative(ROOT, file);
  const content = await readFile(file, "utf8");
  if (content.includes("\u0000")) {
    failures.push(`${relative}: contains a NUL byte`);
  }
  if (content.includes("\r")) {
    failures.push(`${relative}: must use LF line endings`);
  }
  if (!content.endsWith("\n")) {
    failures.push(`${relative}: must end with a newline`);
  }
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (/[ \t]+$/u.test(lines[index])) {
      failures.push(`${relative}:${index + 1}: trailing whitespace`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Text check passed: ${files.length} files`);
}
