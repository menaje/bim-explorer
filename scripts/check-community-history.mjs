import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FORBIDDEN_PATH = new RegExp(
  [
    "(^|/)",
    "(?:\\.env(?:\\.|$)|fixtures/(?:private|customer)(?:/|$)|",
    "node_modules(?:/|$)|dist(?:/|$)|artifacts(?:/|$))|",
    "\\.(?:ifc|ifczip|ifcxml|rvt|dgn|nwd|nwc|bim)$",
  ].join(""),
  "iu",
);
const SECRET_PATTERN = [
  "-----BEGIN ",
  "([A-Z ]+ )?",
  "PRIVATE KEY-----",
  "|github",
  "_pat_[A-Za-z0-9_]{20,}",
  "|gh",
  "[pousr]_[A-Za-z0-9]{20,}",
  "|AK",
  "IA[0-9A-Z]{16}",
  "|xox",
  "[baprs]-[A-Za-z0-9-]{10,}",
  "|sk",
  "-(proj-)?[A-Za-z0-9_-]{20,}",
].join("");

function git(argumentsValue, {
  allowNoMatch = false,
} = {}) {
  const result = spawnSync("git", argumentsValue, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (
    result.status !== 0 &&
    !(allowNoMatch && result.status === 1)
  ) {
    throw new Error(`git ${argumentsValue[0]} failed`);
  }
  return result.stdout;
}

function uniqueLines(value) {
  return [...new Set(
    value.split(/\r?\n/u).filter(Boolean),
  )].sort();
}

export function checkCommunityHistory() {
  const commits = uniqueLines(
    git(["rev-list", "--all"]),
  );
  const paths = uniqueLines(
    git([
      "log",
      "--all",
      "--name-only",
      "--pretty=format:",
    ]),
  );
  const forbiddenPaths = paths.filter((entry) =>
    FORBIDDEN_PATH.test(entry));
  const secretPatternFiles = [];
  for (const commit of commits) {
    const matches = uniqueLines(
      git([
        "grep",
        "-I",
        "-l",
        "-E",
        "-e",
        SECRET_PATTERN,
        commit,
        "--",
      ], {
        allowNoMatch: true,
      }),
    );
    for (const match of matches) {
      secretPatternFiles.push({
        commit,
        path: match.replace(/^[^:]+:/u, ""),
      });
    }
  }
  const emailDomains = uniqueLines(
    git(["log", "--all", "--format=%ae"]),
  ).map((email) => email.split("@").at(-1));
  const report = {
    schema: "bim-explorer-community-history-check/1",
    commits: commits.length,
    uniquePaths: paths.length,
    forbiddenPaths,
    secretPatternFiles,
    authorEmailDomains: [...new Set(emailDomains)].sort(),
    assertions: {
      noCustomerOrModelArtifacts: forbiddenPaths.length === 0,
      noCredentialPatternFiles: secretPatternFiles.length === 0,
      historyReviewed: commits.length > 0,
    },
  };
  if (!Object.values(report.assertions).every(Boolean)) {
    throw new Error(
      "Community history contains a forbidden path or credential pattern",
    );
  }
  return Object.freeze(report);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = checkCommunityHistory();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
