import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { gzipSync } from "fflate";

import {
  checkCommunityHistory,
} from "./check-community-history.mjs";
import {
  writeCommunitySboms,
} from "./generate-community-sbom.mjs";
import {
  packageVscodeExtension,
} from "./package-vscode-extension.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RELEASE_DOCUMENTS = Object.freeze([
  ["LICENSE", "LICENSE"],
  ["NOTICE", "NOTICE"],
  ["SOURCE_OFFER.md", "SOURCE_OFFER.md"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
  ["TRADEMARKS.md", "TRADEMARKS.md"],
  ["docs/releases/v0.1.0.md", "RELEASE_NOTES.md"],
]);

function git(argumentsValue, {
  encoding = "utf8",
  maxBuffer = 128 * 1024 * 1024,
} = {}) {
  const result = spawnSync("git", argumentsValue, {
    cwd: ROOT,
    encoding,
    maxBuffer,
  });
  if (result.status !== 0) {
    throw new Error(`git ${argumentsValue[0]} failed`);
  }
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileEvidence(directory, file) {
  const content = await readFile(path.join(directory, file));
  return Object.freeze({
    file,
    byteLength: content.byteLength,
    sha256: sha256(content),
  });
}

async function requireEmptyOutput(outputDirectory) {
  const resolved = path.resolve(outputDirectory);
  if (
    resolved === ROOT ||
    resolved === path.dirname(ROOT) ||
    resolved.includes(`${path.sep}.git${path.sep}`)
  ) {
    throw new TypeError("release output directory is unsafe");
  }
  try {
    const metadata = await stat(resolved);
    if (!metadata.isDirectory()) {
      throw new TypeError("release output must be a directory");
    }
    if ((await readdir(resolved)).length > 0) {
      throw new Error("release output directory must be empty");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    await mkdir(resolved, {
      recursive: true,
    });
  }
  return resolved;
}

function requireCleanSource() {
  const status = git([
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]).trim();
  if (status.length > 0) {
    throw new Error(
      "Community release requires a clean tracked source tree",
    );
  }
}

function sourceArchive({
  commit,
  version,
}) {
  const tar = git([
    "archive",
    "--format=tar",
    `--prefix=bim-explorer-${version}/`,
    commit,
  ], {
    encoding: null,
  });
  return gzipSync(tar, {
    level: 9,
    mtime: 0,
  });
}

export async function buildCommunityRelease(outputDirectory) {
  requireCleanSource();
  const output = await requireEmptyOutput(outputDirectory);
  const manifest = JSON.parse(
    await readFile(path.join(ROOT, "package.json"), "utf8"),
  );
  const version = manifest.version;
  const commit = git(["rev-parse", "HEAD"]).trim();
  const createdAt = new Date(
    git(["show", "-s", "--format=%cI", commit]).trim(),
  ).toISOString();
  const history = checkCommunityHistory();

  const vsixFile = `bim-explorer-${version}.vsix`;
  await packageVscodeExtension(path.join(output, vsixFile));
  const sourceFile = `bim-explorer-${version}-source.tar.gz`;
  await writeFile(
    path.join(output, sourceFile),
    sourceArchive({
      commit,
      version,
    }),
  );
  const sbom = await writeCommunitySboms(output);
  for (const [source, destination] of RELEASE_DOCUMENTS) {
    await copyFile(
      path.join(ROOT, source),
      path.join(output, destination),
    );
  }

  const payloadFiles = (await readdir(output)).sort();
  const artifacts = [];
  for (const file of payloadFiles) {
    artifacts.push(await fileEvidence(output, file));
  }
  const releaseManifest = {
    schema: "bim-explorer-community-release/1",
    product: {
      name: "BIM Explorer Community",
      version,
      license: "MPL-2.0",
      officialPublisher: "menaje",
    },
    source: {
      repository: "https://github.com/menaje/bim-explorer",
      commit,
      expectedTag: `v${version}`,
      createdAt,
      cleanTree: true,
    },
    profile: {
      status: "experimental-read-only",
      schema: "IFC4",
      view: "ReferenceView_V1.2",
      maximumSourceBytes: 67_108_864,
      accountRequired: false,
      networkUpload: false,
      nativeWrite: false,
      coniSpatialAuthority: false,
    },
    privacyReview: {
      commits: history.commits,
      uniquePaths: history.uniquePaths,
      noCustomerOrModelArtifacts:
        history.assertions.noCustomerOrModelArtifacts,
      noCredentialPatternFiles:
        history.assertions.noCredentialPatternFiles,
    },
    supplyChain: {
      exactNpmLock: true,
      runtimeSbomPackages: sbom.runtime.packages.length,
      sourceSbomPackages: sbom.source.packages.length,
      deterministicVsixZip: true,
      deterministicGitSourceArchive: true,
      artifactAttestation: "required-for-official-release",
    },
    artifacts,
  };
  await writeFile(
    path.join(output, "release-manifest.json"),
    `${JSON.stringify(releaseManifest, null, 2)}\n`,
    "utf8",
  );

  const checksumFiles = (await readdir(output)).sort();
  const checksums = [];
  for (const file of checksumFiles) {
    const evidence = await fileEvidence(output, file);
    checksums.push(`${evidence.sha256}  ${file}`);
  }
  await writeFile(
    path.join(output, "SHA256SUMS"),
    `${checksums.join("\n")}\n`,
    "utf8",
  );

  return Object.freeze({
    output,
    version,
    commit,
    artifacts: checksumFiles.length + 1,
    manifest: releaseManifest,
  });
}

function parseArguments(values) {
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    typeof values[1] !== "string" ||
    values[1].length === 0
  ) {
    throw new TypeError(
      "usage: node scripts/build-community-release.mjs --out <directory>",
    );
  }
  return path.resolve(ROOT, values[1]);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await buildCommunityRelease(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(
    `Community release ${result.version}: ` +
      `${result.artifacts} files from ${result.commit}\n`,
  );
}
