import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FIRST_PARTY_MANIFESTS = Object.freeze([
  "package.json",
  "adapters/web-ifc/package.json",
  "apps/bim-explorer-vscode/package.json",
  "packages/bim-model-source/package.json",
  "packages/bim-renderer-3d/package.json",
  "packages/bim-semantic-explorer/package.json",
  "packages/ifc-engine-contract/package.json",
  "packages/openbim-explorer/package.json",
  "packages/spatial-integration/package.json",
  "packages/viewer-core-consumer/package.json",
  "packaging/web-ifc-platform-stage/package.json",
]);
const RUNTIME_FIRST_PARTY = new Set([
  "bim-explorer",
  "@bim-explorer/adapter-web-ifc",
  "@bim-explorer/bim-model-source",
  "@bim-explorer/bim-renderer-3d",
  "@bim-explorer/bim-semantic-explorer",
]);

function git(...argumentsValue) {
  const result = spawnSync("git", argumentsValue, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${argumentsValue[0]} failed`);
  }
  return result.stdout.trim();
}

function spdxId(value) {
  return `SPDXRef-Package-${value
    .replace(/^@/u, "")
    .replace(/[^A-Za-z0-9.-]+/gu, "-")}`;
}

function npmNameFromLockPath(lockPath) {
  return lockPath.split("node_modules/").at(-1);
}

function integrityChecksum(integrity) {
  if (typeof integrity !== "string") {
    return [];
  }
  const match = /^(sha(?:1|256|512))-(.+)$/u.exec(integrity);
  if (match === null) {
    return [];
  }
  return [{
    algorithm: match[1].toUpperCase(),
    checksumValue: Buffer.from(match[2], "base64").toString("hex"),
  }];
}

function declaredLicense(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("SEE LICENSE IN ")
  ) {
    return "NOASSERTION";
  }
  return value;
}

function npmPurl(name, version) {
  const encoded = name.startsWith("@")
    ? `${encodeURIComponent(name.split("/")[0])}/` +
      `${encodeURIComponent(name.split("/").slice(1).join("/"))}`
    : encodeURIComponent(name);
  return `pkg:npm/${encoded}@${encodeURIComponent(version)}`;
}

function sourceLocation(commit, relative = "") {
  const suffix = relative.length > 0 ? `/${relative}` : "";
  return `https://github.com/menaje/bim-explorer/tree/${commit}${suffix}`;
}

async function firstPartyPackages(commit) {
  const packages = [];
  const seen = new Set();
  for (const relative of FIRST_PARTY_MANIFESTS) {
    const manifest = JSON.parse(
      await readFile(path.join(ROOT, relative), "utf8"),
    );
    const key = `${manifest.name}@${manifest.version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    packages.push({
      SPDXID: spdxId(manifest.name),
      name: manifest.name,
      versionInfo: manifest.version,
      downloadLocation: sourceLocation(
        commit,
        path.dirname(relative) === "." ? "" : path.dirname(relative),
      ),
      filesAnalyzed: false,
      licenseConcluded: manifest.license,
      licenseDeclared: manifest.license,
      copyrightText: "Copyright 2026 BIM Explorer contributors",
      primaryPackagePurpose:
        manifest.name === "bim-explorer"
          ? "APPLICATION"
          : "LIBRARY",
      externalRefs: [{
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: npmPurl(
          manifest.name,
          manifest.version,
        ),
      }],
    });
  }
  return packages.sort((left, right) =>
    left.SPDXID.localeCompare(right.SPDXID));
}

function externalPackages(lock) {
  const packages = [];
  for (const [lockPath, metadata] of Object.entries(
    lock.packages ?? {},
  )) {
    if (
      !lockPath.includes("node_modules/") ||
      metadata.link === true ||
      typeof metadata.version !== "string"
    ) {
      continue;
    }
    const name = npmNameFromLockPath(lockPath);
    const license = declaredLicense(metadata.license);
    const item = {
      SPDXID: spdxId(`${name}-${metadata.version}-${lockPath}`),
      name,
      versionInfo: metadata.version,
      downloadLocation:
        typeof metadata.resolved === "string"
          ? metadata.resolved
          : "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: license,
      copyrightText: "NOASSERTION",
      primaryPackagePurpose: "LIBRARY",
      externalRefs: [{
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: npmPurl(name, metadata.version),
      }],
    };
    const checksums = integrityChecksum(metadata.integrity);
    if (checksums.length > 0) {
      item.checksums = checksums;
    }
    if (metadata.dev === true) {
      item.comment = "Development/build dependency; not in the VSIX runtime.";
    }
    packages.push(item);
  }
  return packages.sort((left, right) =>
    left.SPDXID.localeCompare(right.SPDXID));
}

function creationTimestamp() {
  return new Date(
    git("show", "-s", "--format=%cI", "HEAD"),
  ).toISOString().replace(".000Z", "Z");
}

function document({
  commit,
  kind,
  packages,
  version,
}) {
  const root = spdxId("bim-explorer");
  const relationships = packages
    .filter((item) => item.SPDXID !== root)
    .map((item) => ({
      spdxElementId: root,
      relationshipType: "CONTAINS",
      relatedSpdxElement: item.SPDXID,
    }))
    .sort((left, right) =>
      left.relatedSpdxElement.localeCompare(
        right.relatedSpdxElement,
      ));
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `bim-explorer-${version}-${kind}`,
    documentNamespace:
      `https://github.com/menaje/bim-explorer/spdx/` +
      `${version}/${commit}/${kind}`,
    creationInfo: {
      created: creationTimestamp(),
      creators: [
        `Tool: bim-explorer-community-release-${version}`,
      ],
      licenseListVersion: "3.27",
    },
    documentDescribes: [root],
    packages,
    relationships,
  };
}

export async function generateCommunitySboms() {
  const rootManifest = JSON.parse(
    await readFile(path.join(ROOT, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(path.join(ROOT, "package-lock.json"), "utf8"),
  );
  const commit = git("rev-parse", "HEAD");
  const firstParty = await firstPartyPackages(commit);
  const external = externalPackages(lock);
  const webIfc = external.filter((item) =>
    item.name === "web-ifc" &&
    item.versionInfo === "0.0.77");
  if (webIfc.length !== 1) {
    throw new Error("runtime SBOM requires exact web-ifc@0.0.77");
  }
  const runtime = [
    ...firstParty.filter((item) =>
      RUNTIME_FIRST_PARTY.has(item.name)),
    webIfc[0],
  ].sort((left, right) =>
    left.SPDXID.localeCompare(right.SPDXID));
  const source = [
    ...firstParty,
    ...external,
  ].sort((left, right) =>
    left.SPDXID.localeCompare(right.SPDXID));

  return Object.freeze({
    commit,
    version: rootManifest.version,
    runtime: document({
      commit,
      kind: "runtime",
      packages: runtime,
      version: rootManifest.version,
    }),
    source: document({
      commit,
      kind: "source",
      packages: source,
      version: rootManifest.version,
    }),
  });
}

export async function writeCommunitySboms(outputDirectory) {
  const result = await generateCommunitySboms();
  await mkdir(outputDirectory, {
    recursive: true,
  });
  const runtimePath = path.join(
    outputDirectory,
    `bim-explorer-${result.version}.spdx.json`,
  );
  const sourcePath = path.join(
    outputDirectory,
    `bim-explorer-${result.version}-source.spdx.json`,
  );
  await Promise.all([
    writeFile(
      runtimePath,
      `${JSON.stringify(result.runtime, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      sourcePath,
      `${JSON.stringify(result.source, null, 2)}\n`,
      "utf8",
    ),
  ]);
  return Object.freeze({
    ...result,
    runtimePath,
    sourcePath,
  });
}

function parseArguments(values) {
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    values[1].length === 0
  ) {
    throw new TypeError(
      "usage: node scripts/generate-community-sbom.mjs --out <directory>",
    );
  }
  return path.resolve(ROOT, values[1]);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await writeCommunitySboms(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(
    `Community SBOM: ${result.runtime.packages.length} runtime, ` +
      `${result.source.packages.length} source packages\n`,
  );
}
