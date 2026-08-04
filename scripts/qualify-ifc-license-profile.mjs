import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const WEB_IFC = Object.freeze({
  package: "web-ifc",
  version: "0.0.77",
  license: "MPL-2.0",
  resolved:
    "https://registry.npmjs.org/web-ifc/-/web-ifc-0.0.77.tgz",
  integrity:
    "sha512-VzQ0W/Iiqbidxn1ECUvz6qJ6p2sXBVNcOsUOBCETzy77psAH6yFLKQm74a" +
    "Xabkx3JH4OvFVHe8k1qS6+Z2zl1w==",
  tarballSha256:
    "d9f88c96bde26a2b1e317458f8fa38ac46f18f1f688f2cb1a7f8e97890f2f341",
  tarballBytes: 3_088_753,
  gitHead: "f26c4beef0a668ebdb180d2b95a94097a1e21cef",
  sourceUrl:
    "https://github.com/ThatOpen/engine_web-ifc/tree/" +
    "f26c4beef0a668ebdb180d2b95a94097a1e21cef",
  licenseSha256:
    "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5",
  installedEntries: 14,
  installedBytes: 23_995_895,
  installedContentSha256:
    "d7d35cd72317078b0bd191670a601bea61dc216852943d378f2a088a310434ef",
});
const NOTICE_PATHS = Object.freeze([
  "THIRD_PARTY_NOTICES.md",
  "adapters/web-ifc/THIRD_PARTY_NOTICES.md",
  "packaging/web-ifc-platform-stage/THIRD_PARTY_NOTICES.md",
]);
const RUNTIME_PATHS = Object.freeze([
  "web-ifc-api-node.js",
  "web-ifc-api.js",
  "web-ifc-node.wasm",
  "web-ifc.wasm",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      throw new Error("web-ifc package contains a non-file entry");
    }
  }
  return files.sort();
}

async function installedContent(packageRoot) {
  const files = await filesBelow(packageRoot);
  const digest = createHash("sha256");
  let bytes = 0;
  const inventory = new Map();
  for (const file of files) {
    const content = await readFile(file);
    const relative = path
      .relative(packageRoot, file)
      .split(path.sep)
      .join("/");
    bytes += content.byteLength;
    digest.update(relative);
    digest.update("\0");
    digest.update(String(content.byteLength));
    digest.update("\0");
    digest.update(content);
    digest.update("\0");
    inventory.set(relative, Object.freeze({
      bytes: content.byteLength,
      sha256: sha256(content),
    }));
  }
  return Object.freeze({
    entries: files.length,
    bytes,
    sha256: digest.digest("hex"),
    inventory,
  });
}

async function noticeEvidence(relative) {
  const content = await readFile(
    path.join(repositoryRoot, relative),
  );
  const text = content.toString("utf8");
  assert.match(text, /web-ifc/u);
  assert.match(text, /0\.0\.77/u);
  assert.match(text, /MPL/u);
  assert.match(text, new RegExp(WEB_IFC.gitHead, "u"));
  assert.match(text, /source/u);
  assert.match(text, /법률/u);
  return Object.freeze({
    path: relative,
    bytes: content.byteLength,
    sha256: sha256(content),
    exactVersion: true,
    exactSource: true,
    legalApprovalDisclaimed: true,
  });
}

export async function qualifyIfcLicenseProfile() {
  const [
    rootManifest,
    adapterManifest,
    lock,
    packageManifest,
  ] = await Promise.all([
    readFile(path.join(repositoryRoot, "package.json"), "utf8")
      .then(JSON.parse),
    readFile(
      path.join(
        repositoryRoot,
        "adapters",
        "web-ifc",
        "package.json",
      ),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(repositoryRoot, "package-lock.json"),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(
        repositoryRoot,
        "node_modules",
        "web-ifc",
        "package.json",
      ),
      "utf8",
    ).then(JSON.parse),
  ]);
  const packageRoot = path.join(
    repositoryRoot,
    "node_modules",
    "web-ifc",
  );
  const lockEntry = lock.packages["node_modules/web-ifc"];
  const content = await installedContent(packageRoot);
  const license = await readFile(
    path.join(packageRoot, "LICENSE.md"),
  );

  assert.equal(rootManifest.private, true);
  assert.equal(rootManifest.license, "MPL-2.0");
  assert.equal(adapterManifest.dependencies["web-ifc"], WEB_IFC.version);
  assert.equal(packageManifest.name, WEB_IFC.package);
  assert.equal(packageManifest.version, WEB_IFC.version);
  assert.equal(packageManifest.license, WEB_IFC.license);
  assert.equal(lockEntry.version, WEB_IFC.version);
  assert.equal(lockEntry.resolved, WEB_IFC.resolved);
  assert.equal(lockEntry.integrity, WEB_IFC.integrity);
  assert.equal(lockEntry.license, WEB_IFC.license);
  assert.equal(content.entries, WEB_IFC.installedEntries);
  assert.equal(content.bytes, WEB_IFC.installedBytes);
  assert.equal(content.sha256, WEB_IFC.installedContentSha256);
  assert.equal(sha256(license), WEB_IFC.licenseSha256);

  const runtimeFiles = {};
  for (const relative of RUNTIME_PATHS) {
    const observed = content.inventory.get(relative);
    assert.ok(observed, `${relative} is absent from web-ifc`);
    runtimeFiles[relative] = observed;
  }
  const declaredMultiThreadWorker =
    packageManifest.files.includes("web-ifc-mt.worker.js");
  let multiThreadWorkerPresent = true;
  try {
    await stat(path.join(packageRoot, "web-ifc-mt.worker.js"));
  } catch {
    multiThreadWorkerPresent = false;
  }
  assert.equal(declaredMultiThreadWorker, true);
  assert.equal(multiThreadWorkerPresent, false);

  const notices = [];
  for (const relative of NOTICE_PATHS) {
    notices.push(await noticeEvidence(relative));
  }

  const report = {
    schema:
      "bim-explorer-ifc-license-profile-qualification/1",
    status: "passed-technical-due-diligence",
    asOf: "2026-08-04",
    scope: {
      profile: {
        schema: "IFC4",
        view: "ReferenceView_V1.2",
        exchangeScenario:
          "local read-only semantic and extruded-geometry exploration",
      },
      admission: "experimental-read-only",
      legalAdvice: false,
      productionRedistributionApproval: false,
    },
    repository: {
      private: rootManifest.private,
      license: rootManifest.license,
      publicOpenSourceLicense: "MPL-2.0",
    },
    selectedEngine: {
      id: "web-ifc",
      version: WEB_IFC.version,
      role: "primary-experimental-read-only",
      browserBoundary: "dedicated-single-thread-wasm-worker",
      nodeBoundary: "isolated-node-wasm-process",
      sourceModified: false,
    },
    artifact: {
      registry: "npm",
      package: WEB_IFC.package,
      version: WEB_IFC.version,
      resolved: WEB_IFC.resolved,
      integrity: WEB_IFC.integrity,
      observedTarball: {
        bytes: WEB_IFC.tarballBytes,
        sha256: WEB_IFC.tarballSha256,
      },
      npmGitHead: WEB_IFC.gitHead,
      exactSource: WEB_IFC.sourceUrl,
      installedContent: {
        entries: content.entries,
        bytes: content.bytes,
        sha256: content.sha256,
      },
      runtimeFiles,
      license: {
        spdx: WEB_IFC.license,
        path: "node_modules/web-ifc/LICENSE.md",
        bytes: license.byteLength,
        sha256: sha256(license),
        fullTextPresent: true,
      },
    },
    packagingBoundary: {
      selectedRuntime: {
        browser: [
          "web-ifc-api.js",
          "web-ifc.wasm",
        ],
        node: [
          "web-ifc-api-node.js",
          "web-ifc-node.wasm",
        ],
      },
      exactNotices: notices,
      sourceAvailability: {
        exactSourceUrlRecorded: true,
        executableDistributionNoticeRequired: true,
        mplModificationSourceRequired: true,
        minifiedJavascriptTreatedAsExecutable: true,
        separateProductFilesRemainSeparate: true,
      },
      multiThreadRuntime: {
        declaredWorkerFile: true,
        publishedWorkerFilePresent: false,
        admission: "blocked",
      },
      publicBrowserPackage: "blocked",
      publicVscodePackage: "blocked",
      sbom: "blocked",
      signing: "blocked",
    },
    fallback: {
      id: "ifcopenshell",
      version: "0.8.4.post1",
      role: "qualification-reference-oracle",
      bundled: false,
      reason:
        "wheel integrity, Linux package boundary and LGPL obligations " +
        "remain unqualified",
    },
    decision: {
      engineSelection: "web-ifc",
      profileAdmission: "passed-experimental-read-only",
      writeRoundTrip: "blocked",
      productionRedistribution:
        "blocked-release-engineering-and-legal-gate",
      legalApproval: false,
      productionClaims: false,
    },
    references: {
      mplLicense:
        "https://www.mozilla.org/en-US/MPL/2.0/",
      mplFaq:
        "https://www.mozilla.org/en-US/MPL/2.0/FAQ/",
      webIfcUpstream:
        "https://github.com/ThatOpen/engine_web-ifc",
      ifcOpenShellLibrary:
        "https://docs.ifcopenshell.org/ifcopenshell.html",
    },
  };
  assert.doesNotMatch(
    JSON.stringify(report),
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u,
  );
  return Object.freeze(report);
}

async function main() {
  process.stdout.write(
    `${JSON.stringify(await qualifyIfcLicenseProfile(), null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
