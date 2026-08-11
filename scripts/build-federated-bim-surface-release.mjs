import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  FEDERATED_BIM_SURFACE_PACKAGE,
  packFederatedBimSurfacePackage,
  qualifyFederatedBimSurfacePackage,
  stageFederatedBimSurfacePackage,
} from "./qualify-federated-bim-surface-package.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RELEASE_DOCUMENTS = Object.freeze([
  ["LICENSE", "LICENSE"],
  ["NOTICE", "NOTICE"],
  ["TRADEMARKS.md", "TRADEMARKS.md"],
  [
    "packages/federated-bim-surface/SOURCE_OFFER.md",
    "SOURCE_OFFER.md",
  ],
  [
    "docs/releases/bim-surface-v0.2.0.md",
    "RELEASE_NOTES.md",
  ],
]);

function git(argumentsValue) {
  const result = spawnSync("git", argumentsValue, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${argumentsValue[0]} failed`);
  }
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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
    throw new TypeError(
      "Federated BIM surface release output is unsafe",
    );
  }
  try {
    const metadata = await stat(resolved);
    if (!metadata.isDirectory()) {
      throw new TypeError(
        "Federated BIM surface release output must be a directory",
      );
    }
    if ((await readdir(resolved)).length > 0) {
      throw new Error(
        "Federated BIM surface release output directory must be empty",
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    await mkdir(resolved, { recursive: true });
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
      "Federated BIM surface release requires a clean tracked source tree",
    );
  }
}

function createSpdx({ commit, createdAt, packageArtifact }) {
  const { name, version, publicReleaseTag } =
    FEDERATED_BIM_SURFACE_PACKAGE;
  return Object.freeze({
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `bim-explorer-federated-bim-surface-${version}`,
    documentNamespace:
      "https://spdx.org/spdxdocs/" +
      `bim-explorer-federated-bim-surface-${version}-${commit}`,
    creationInfo: {
      created: createdAt,
      creators: [
        "Tool: bim-explorer-build-federated-bim-surface-release/1",
      ],
    },
    packages: [
      {
        name,
        SPDXID: "SPDXRef-Package-FederatedBimSurface",
        versionInfo: version,
        downloadLocation:
          "https://github.com/menaje/bim-explorer/releases/" +
          `download/${publicReleaseTag}/${packageArtifact.filename}`,
        filesAnalyzed: false,
        checksums: [
          {
            algorithm: "SHA256",
            checksumValue: packageArtifact.sha256,
          },
        ],
        licenseConcluded: "MPL-2.0",
        licenseDeclared: "MPL-2.0",
        copyrightText: "Copyright 2026 BIM Explorer contributors",
      },
    ],
    relationships: [
      {
        spdxElementId: "SPDXRef-DOCUMENT",
        relationshipType: "DESCRIBES",
        relatedSpdxElement:
          "SPDXRef-Package-FederatedBimSurface",
      },
    ],
  });
}

export async function buildFederatedBimSurfaceRelease(
  outputDirectory,
) {
  requireCleanSource();
  const output = await requireEmptyOutput(outputDirectory);
  const qualification = await qualifyFederatedBimSurfacePackage();
  const temporary = await mkdtemp(
    path.join(tmpdir(), "federated-bim-surface-release-"),
  );
  try {
    const stage = path.join(temporary, "stage");
    await stageFederatedBimSurfacePackage(stage);
    const packageArtifact = await packFederatedBimSurfacePackage(
      stage,
      path.join(temporary, "pack"),
    );
    if (
      packageArtifact.sha256 !== qualification.package.sha256 ||
      packageArtifact.integrity !== qualification.package.integrity
    ) {
      throw new Error(
        "Federated BIM surface release differs from qualification",
      );
    }

    await copyFile(
      packageArtifact.tarball,
      path.join(output, packageArtifact.filename),
    );
    for (const [source, destination] of RELEASE_DOCUMENTS) {
      await copyFile(
        path.join(ROOT, source),
        path.join(output, destination),
      );
    }

    const commit = git(["rev-parse", "HEAD"]).trim();
    const createdAt = new Date(
      git(["show", "-s", "--format=%cI", commit]).trim(),
    ).toISOString();
    const sbomFile =
      `bim-explorer-federated-bim-surface-` +
      `${FEDERATED_BIM_SURFACE_PACKAGE.version}.spdx.json`;
    await writeFile(
      path.join(output, sbomFile),
      stableJson(createSpdx({
        commit,
        createdAt,
        packageArtifact,
      })),
      "utf8",
    );

    const payloadFiles = (await readdir(output)).sort();
    const artifacts = [];
    for (const file of payloadFiles) {
      artifacts.push(await fileEvidence(output, file));
    }
    const releaseManifest = {
      schema: "bim-explorer-federated-bim-surface-release/1",
      package: {
        name: FEDERATED_BIM_SURFACE_PACKAGE.name,
        version: FEDERATED_BIM_SURFACE_PACKAGE.version,
        contract: FEDERATED_BIM_SURFACE_PACKAGE.contract,
        license: "MPL-2.0",
        runtimeDependencies: 0,
        repositoryManifestPrivate: true,
      },
      source: {
        repository: "https://github.com/menaje/bim-explorer",
        branch: "prerelease",
        commit,
        expectedTag:
          FEDERATED_BIM_SURFACE_PACKAGE.publicReleaseTag,
        createdAt,
        cleanTree: true,
      },
      profile: {
        status:
          "experimental-read-only-release-ready-candidate",
        hostNeutral: true,
        browserOrDomRequired: false,
        accountRequired: false,
        nativeWrite: false,
        coniSpatialAuthority: false,
        vscodeExtensionIncluded: false,
        marketplacePublication: false,
      },
      qualification: {
        schema: qualification.schema,
        status: qualification.status,
        deterministicPackRuns:
          qualification.reproducibility.independentPackRuns,
        byteIdentical: qualification.reproducibility.byteIdentical,
        offlineCleanInstall: qualification.consumer.cleanProject,
        packageSha256: packageArtifact.sha256,
        packageIntegrity: packageArtifact.integrity,
        runtimeSha256: qualification.package.runtimeSha256,
        spatialConsumerEvidence:
          qualification.spatialConsumer.evidence,
        releaseReadySpatialConsumerEvidence:
          qualification.spatialConsumer.releaseReadyEvidence,
        releaseReadySpatialConsumerSourceCommit:
          qualification.spatialConsumer.releaseReadySourceCommit,
        priorCandidatePackageSha256:
          qualification.spatialConsumer
            .priorCandidatePackageSha256,
      },
      releaseGate: {
        actualSpatialConsumer:
          qualification.releaseGate.actualSpatialConsumer,
        releaseReadyPackageConsumerRevalidation:
          qualification.releaseGate
            .releaseReadyPackageConsumerRevalidation,
        publicRelease: qualification.releaseGate.publicRelease,
        publicationAuthorized:
          qualification.releaseGate.publicationAuthorized,
      },
      postReleaseGate: {
        publicArtifactSpatialAdmission: false,
        productionSupport: false,
      },
      supplyChain: {
        spdxPackages: 1,
        knownRuntimeLicenses: true,
        immutableReleaseAttestation:
          "required-for-official-release",
        workflowBuildAttestation:
          "generated-by-bim-surface-tag-workflow",
        crossPlatformByteIdentity:
          "required-for-official-release",
      },
      authority: {
        workspace: false,
        canonicalEntityId: false,
        sourceMutation: false,
        revisionMutation: false,
        geometryMutation: false,
        constraintMutation: false,
        acceptance: false,
        publish: false,
        export: false,
      },
      artifacts,
    };
    await writeFile(
      path.join(output, "release-manifest.json"),
      stableJson(releaseManifest),
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
      version: FEDERATED_BIM_SURFACE_PACKAGE.version,
      tag: FEDERATED_BIM_SURFACE_PACKAGE.publicReleaseTag,
      commit,
      artifacts: checksumFiles.length + 1,
      publicationAuthorized:
        releaseManifest.releaseGate.publicationAuthorized,
      packageArtifact: Object.freeze({
        filename: packageArtifact.filename,
        byteLength: packageArtifact.byteLength,
        sha256: packageArtifact.sha256,
        integrity: packageArtifact.integrity,
      }),
      manifest: releaseManifest,
    });
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

function parseArguments(values) {
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    typeof values[1] !== "string" ||
    values[1].length === 0
  ) {
    throw new TypeError(
      "usage: node scripts/build-federated-bim-surface-release.mjs " +
        "--out <directory>",
    );
  }
  return path.resolve(ROOT, values[1]);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await buildFederatedBimSurfaceRelease(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(
    `Federated BIM surface release candidate built: ` +
      `${result.artifacts} artifacts, ${result.packageArtifact.byteLength} ` +
      `package bytes, publication authorized ` +
      `${result.publicationAuthorized}\n`,
  );
}
