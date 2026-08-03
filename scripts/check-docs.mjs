import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DOCS_ROOT = path.join(ROOT, "docs");
const REQUIRED_FRONT_MATTER = [
  "type",
  "status",
  "authority",
  "last_reviewed",
];
const ADR_SECTIONS = [
  "## Context",
  "## 비교한 대안",
  "## Decision",
  "## 거부 이유",
  "## 영향 범위",
  "## Rollback과 revisit",
];

async function collectMarkdown(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdown(absolute));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolute);
    }
  }
  return files;
}

function parseFrontMatter(content, relative) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(content);
  if (!match) {
    throw new Error(`${relative}: missing YAML front matter`);
  }
  const frontMatter = match[1];
  for (const key of REQUIRED_FRONT_MATTER) {
    if (!new RegExp(`^${key}:`, "mu").test(frontMatter)) {
      throw new Error(`${relative}: missing front matter key ${key}`);
    }
  }
  if (
    !/^last_reviewed: \d{4}-\d{2}-\d{2}$/mu.test(frontMatter)
  ) {
    throw new Error(`${relative}: invalid last_reviewed date`);
  }
  if (!/^authority:\n(?:  - .+\n?)+/mu.test(`${frontMatter}\n`)) {
    throw new Error(`${relative}: authority must be a non-empty list`);
  }
  return frontMatter;
}

async function linkExists(sourceFile, target) {
  if (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("#")
  ) {
    return true;
  }
  const normalized = target
    .replace(/^<|>$/gu, "")
    .split("#", 1)[0];
  if (normalized.length === 0) {
    return true;
  }
  const decoded = decodeURIComponent(normalized);
  try {
    await stat(path.resolve(path.dirname(sourceFile), decoded));
    return true;
  } catch {
    return false;
  }
}

const failures = [];
const files = await collectMarkdown(DOCS_ROOT);
for (const file of files) {
  const relative = path.relative(ROOT, file);
  const content = await readFile(file, "utf8");
  try {
    const frontMatter = parseFrontMatter(content, relative);
    if (relative.includes(`${path.sep}adr${path.sep}`)) {
      if (!/^decision_id: ADR-\d{4}$/mu.test(frontMatter)) {
        failures.push(`${relative}: ADR requires decision_id`);
      }
      for (const section of ADR_SECTIONS) {
        if (!content.includes(section)) {
          failures.push(`${relative}: missing ADR section ${section}`);
        }
      }
    }
  } catch (error) {
    failures.push(error.message);
  }

  const links = content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu);
  for (const match of links) {
    if (!await linkExists(file, match[1])) {
      failures.push(`${relative}: broken local link ${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Docs check passed: ${files.length} documents`);
}
