import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  checkFederatedBimSurfaceV03Bundle,
} from "./build-federated-bim-surface-v0.3.mjs";
import {
  packFederatedBimSurfacePackage,
} from "./qualify-federated-bim-surface-package.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGE_ROOT = path.join(
  ROOT,
  "packages",
  "federated-bim-surface",
);
const PACKAGE_NAME = "@bim-explorer/federated-bim-surface";
const PACKAGE_VERSION = "0.3.0";
const PACKAGE_CONTRACT = "bim-explorer-bim-surface/0.2";
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "compatibility",
  "evidence",
  "bim-retained-overlay-package-release-ready-2026-08-15.json",
);
const AUTHORITY_KEYS = Object.freeze([
  "workspace",
  "canonicalEntityId",
  "sourceMutation",
  "revisionMutation",
  "geometryMutation",
  "constraintMutation",
  "acceptance",
  "publish",
  "export",
]);

export const FEDERATED_BIM_SURFACE_V03_PACKAGE = Object.freeze({
  name: PACKAGE_NAME,
  version: PACKAGE_VERSION,
  contract: PACKAGE_CONTRACT,
  publicReleaseTag: "bim-surface-v0.3.0",
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ` +
        `${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function fixtureJson(value) {
  return JSON.stringify(value, (_key, item) => {
    if (ArrayBuffer.isView(item)) {
      return {
        __bimExplorerBytes: Buffer.from(
          item.buffer,
          item.byteOffset,
          item.byteLength,
        ).toString("base64"),
      };
    }
    return item;
  });
}

export async function stageFederatedBimSurfaceV03Package(destination) {
  await mkdir(path.join(destination, "runtime"), {
    recursive: true,
  });
  const repositoryManifest = JSON.parse(await readFile(
    path.join(PACKAGE_ROOT, "package.json"),
    "utf8",
  ));
  if (
    repositoryManifest.name !== PACKAGE_NAME ||
    repositoryManifest.version !== PACKAGE_VERSION ||
    repositoryManifest.private !== true ||
    repositoryManifest.exports !== "./runtime/index.mjs"
  ) {
    throw new Error(
      "federated BIM surface v0.3 repository package boundary is invalid",
    );
  }
  const manifest = {
    ...repositoryManifest,
    files: [
      "runtime/index.mjs",
      "README.md",
      "LICENSE",
      "NOTICE",
      "SOURCE_OFFER.md",
    ],
  };
  await writeFile(
    path.join(destination, "package.json"),
    stableJson(manifest),
    "utf8",
  );
  await copyFile(
    path.join(PACKAGE_ROOT, "runtime", "index.mjs"),
    path.join(destination, "runtime", "index.mjs"),
  );
  await copyFile(
    path.join(PACKAGE_ROOT, "README.md"),
    path.join(destination, "README.md"),
  );
  for (const relative of ["LICENSE", "NOTICE", "SOURCE_OFFER.md"]) {
    await copyFile(
      relative === "SOURCE_OFFER.md"
        ? path.join(PACKAGE_ROOT, relative)
        : path.join(ROOT, relative),
      path.join(destination, relative),
    );
  }
}

const CONSUMER_SOURCE = String.raw`
import { readFile } from "node:fs/promises";
import * as surfacePackage from "@bim-explorer/federated-bim-surface";

function revive(_key, value) {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof value.__bimExplorerBytes === "string" &&
    Object.keys(value).length === 1
  ) {
    return Uint8Array.from(
      Buffer.from(value.__bimExplorerBytes, "base64"),
    );
  }
  return value;
}

const fixture = JSON.parse(
  await readFile(new URL("./fixture.json", import.meta.url), "utf8"),
  revive,
);
const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);
const requiredExports = [
  "BIM_FEDERATED_RETAINED_OVERLAY_ADAPTER_SCHEMA",
  "BIM_FEDERATED_RETAINED_OVERLAY_CONTRACT",
  "BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE",
  "BIM_RETAINED_OVERLAY_PACKET_SCHEMA",
  "createBimModelSource",
  "createBounded3dRenderer",
  "createExplicitAlignment",
  "createFederatedBimSurface",
  "createHeadless3dBackend",
  "decodeBimRetainedOverlayPacket",
  "encodeBimRetainedOverlayPacket",
  "sha256BimRetainedOverlayPacket",
];

const source = surfacePackage.createBimModelSource(fixture.ifcArtifact);
const session = await source.open({
  protocolVersion: surfacePackage.BIM_SOURCE_PROTOCOL_VERSION,
});
const snapshot = await session.getSnapshot();
const backend = surfacePackage.createHeadless3dBackend();
const renderer = surfacePackage.createBounded3dRenderer({ backend });
const surface = surfacePackage.createFederatedBimSurface({ renderer });
const opened = await surface.open({
  federationId: "federation:artifact-retained-overlay-v03",
  sources: [{
    federationSourceId: "source-slot:consumer-overlay",
    sourceRole: "consumer-overlay",
    lifecycleOwnership: "borrowed",
    session,
    snapshot,
    alignment: surfacePackage.createExplicitAlignment({
      sourceRevisionId: snapshot.revisionId,
      sourceCoordinateSystem: snapshot.coordinateSystem.source,
      federationCoordinateSystem: "federation-local",
      sourceToFederation: IDENTITY,
      reference: "artifact-qualification:retained-overlay",
    }),
  }],
});
const entity = snapshot.entities.find((candidate) =>
  candidate.renderable === true);
if (!entity) {
  throw new Error("artifact consumer has no renderable entity");
}
const toRevisionId = snapshot.revisionId + ":retained:1";
const packet = surfacePackage.encodeBimRetainedOverlayPacket({
  deltaId: "delta:artifact-retained:1",
  sourceId: snapshot.sourceId,
  layerId: snapshot.layerId,
  fromRevisionId: snapshot.revisionId,
  toRevisionId,
  sequence: 1,
  entries: [{
    operationId: "operation:artifact-retained:1",
    kind: "upsert",
    aspect: "geometry",
    renderId: entity.renderId,
    pickId: entity.pickId + ":retained:1",
    nativeId: entity.nativeId ?? entity.globalId,
    externalIdentityToken: entity.externalIdentityToken,
    bounds: entity.bounds,
    transform: IDENTITY,
    color: [0.2, 0.5, 0.9, 1],
    visible: true,
    geometry: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    },
  }],
});
const decoded = surfacePackage.decodeBimRetainedOverlayPacket(packet);
const delta = Object.freeze({
  deltaId: "delta:artifact-retained:1",
  sourceId: snapshot.sourceId,
  fromRevisionId: snapshot.revisionId,
  toRevisionId,
  sequence: 1,
  affectedWorldBounds: entity.bounds,
  operations: Object.freeze([{
    operationId: "operation:artifact-retained:1",
    kind: "upsert",
    aspect: "geometry",
    sourceId: snapshot.sourceId,
    layerId: snapshot.layerId,
    renderIds: Object.freeze([entity.renderId]),
    affectedWorldBounds: entity.bounds,
    externalIdentityToken: entity.externalIdentityToken,
  }]),
  payload: Object.freeze({
    mediaType: surfacePackage.BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
    byteLength: packet.byteLength,
    sha256: await surfacePackage.sha256BimRetainedOverlayPacket(packet),
  }),
});
let payloadReads = 0;
const adapter = surface.createRetainedOverlayAdapter({
  federationSourceId: "source-slot:consumer-overlay",
  async readPayload(descriptor) {
    payloadReads += 1;
    if (descriptor.byteLength !== packet.byteLength) {
      throw new Error("artifact payload descriptor differs");
    }
    return packet;
  },
});
const nativeReads = source.state.rangeReads;
const transaction = await adapter.prepareDelta(delta);
const preparedWithoutAdvance =
  surface.state.stagedRetainedDelta === true &&
  surface.state.retainedOverlays[0].revisionId === snapshot.revisionId;
const committed = transaction.commit();
const checkpoint = surface.checkpointRetainedOverlay({
  federationSourceId: "source-slot:consumer-overlay",
  checkpointId: "checkpoint:artifact-retained:1",
  expectedRevisionId: toRevisionId,
});
const committedAtomically =
  committed.status === "applied" &&
  surface.state.stagedRetainedDelta === false &&
  surface.state.retainedOverlays[0].revisionId === toRevisionId &&
  surface.state.retainedOverlays[0].sequence === 1;
const sourceReplayAvoided =
  source.state.rangeReads === nativeReads &&
  checkpoint.externalSourceRangeReads === 0 &&
  checkpoint.externalSourceParses === 0 &&
  checkpoint.externalSourceRangeUploads === 0;
packet.fill(0);
const adapterDisposed = await adapter.dispose();
const disposal = await surface.dispose({ reason: "artifact-consumer-close" });
const terminalResourcesReleased =
  backend.state.activeBytes === 0 &&
  disposal.cleanup.rendererDisposed === true;
await session.dispose();
await source.dispose();

process.stdout.write(JSON.stringify({
  packageVersion: surfacePackage.BIM_FEDERATED_SURFACE_PACKAGE_VERSION,
  surfaceContract: surfacePackage.BIM_FEDERATED_SURFACE_CONTRACT,
  retainedContract:
    surfacePackage.BIM_FEDERATED_RETAINED_OVERLAY_CONTRACT,
  adapterSchema: adapter.schema,
  packetSchema: decoded.schema,
  exports: {
    count: Object.keys(surfacePackage).length,
    required: Object.fromEntries(requiredExports.map((name) => [
      name,
      Object.hasOwn(surfacePackage, name),
    ])),
  },
  checks: {
    artifactOnlyImport: true,
    consumerOverlayRegistered: opened.sources.length === 1 &&
      opened.sources[0].sourceRole === "consumer-overlay",
    payloadReadOnce: payloadReads === 1,
    preparedWithoutAdvance,
    committedAtomically,
    sourceReplayAvoided,
    checkpointed: checkpoint.status === "checkpointed",
    adapterDisposed,
    terminalResourcesReleased,
    authorityFree: Object.values(opened.authority).every((value) =>
      value === false),
  },
}));
`;

async function runConsumer(tarball, fixture, temporary) {
  const consumer = path.join(temporary, "consumer");
  await mkdir(consumer, { recursive: true });
  await writeFile(
    path.join(consumer, "package.json"),
    stableJson({
      name: "federated-bim-surface-v03-artifact-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
    }),
    "utf8",
  );
  await writeFile(
    path.join(consumer, "fixture.json"),
    fixtureJson(fixture),
    "utf8",
  );
  await writeFile(
    path.join(consumer, "consumer.mjs"),
    CONSUMER_SOURCE,
    "utf8",
  );
  run(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    { cwd: consumer },
  );
  return JSON.parse(run(process.execPath, ["consumer.mjs"], {
    cwd: consumer,
  }));
}

function validateConsumer(report) {
  if (
    report?.packageVersion !== PACKAGE_VERSION ||
    report.surfaceContract !== PACKAGE_CONTRACT ||
    report.retainedContract !==
      "bim-explorer-federated-retained-overlay/0.1" ||
    report.adapterSchema !==
      "bim-explorer-federated-retained-overlay-adapter/0.1" ||
    report.packetSchema !==
      "bim-explorer-retained-overlay-packet/0.1" ||
    !Number.isSafeInteger(report.exports?.count) ||
    report.exports.count < 90 ||
    Object.values(report.exports.required ?? {}).some(
      (value) => value !== true,
    ) ||
    !same(Object.keys(report.checks ?? {}), [
      "artifactOnlyImport",
      "consumerOverlayRegistered",
      "payloadReadOnce",
      "preparedWithoutAdvance",
      "committedAtomically",
      "sourceReplayAvoided",
      "checkpointed",
      "adapterDisposed",
      "terminalResourcesReleased",
      "authorityFree",
    ]) ||
    Object.values(report.checks).some((value) => value !== true)
  ) {
    throw new Error(
      "clean-installed retained overlay artifact conformance failed: " +
        JSON.stringify(report),
    );
  }
  return true;
}

export function validateFederatedBimSurfaceV03PackageQualification(
  evidence,
) {
  if (
    evidence?.schema !==
      "bim-explorer-federated-bim-surface-package-qualification/2" ||
    evidence.status !==
      "passed-retained-overlay-release-ready-artifact" ||
    evidence.asOf !== "2026-08-15" ||
    evidence.package?.name !== PACKAGE_NAME ||
    evidence.package.version !== PACKAGE_VERSION ||
    evidence.package.contract !== PACKAGE_CONTRACT ||
    evidence.package.private !== true ||
    evidence.package.runtimeDependencies !== 0 ||
    evidence.package.filename !==
      "bim-explorer-federated-bim-surface-0.3.0.tgz" ||
    !Number.isSafeInteger(evidence.package.byteLength) ||
    evidence.package.byteLength <= 0 ||
    !/^[0-9a-f]{64}$/u.test(evidence.package.sha256 ?? "") ||
    !/^[0-9a-f]{64}$/u.test(evidence.package.runtimeSha256 ?? "") ||
    !/^sha512-[A-Za-z0-9+/]+=*$/u.test(
      evidence.package.integrity ?? "",
    ) ||
    !same(evidence.reproducibility, {
      independentPackRuns: 2,
      byteIdentical: true,
      firstSha256: evidence.package.sha256,
      secondSha256: evidence.package.sha256,
    }) ||
    evidence.consumer?.install !== "offline-local-tarball" ||
    evidence.consumer.cleanProject !== true ||
    evidence.releaseGate?.expectedTag !==
      FEDERATED_BIM_SURFACE_V03_PACKAGE.publicReleaseTag ||
    evidence.releaseGate.branch !== "prerelease" ||
    evidence.releaseGate.artifactOnlyRetainedOverlay !== true ||
    evidence.releaseGate.publicRelease !== false ||
    evidence.releaseGate.publicationAuthorized !== true ||
    Object.values(evidence.authority ?? {}).some(Boolean) ||
    evidence.claims?.publicRegistryPublication !== false ||
    evidence.claims.publicSurfaceArtifact !== false ||
    evidence.claims.publishedViewerCore013Artifact !== false ||
    evidence.claims.crossPlatformPhysicalGpu !== false ||
    evidence.claims.productionSupport !== false
  ) {
    throw new Error(
      "federated BIM surface v0.3 package qualification is invalid",
    );
  }
  validateConsumer(evidence.consumer.lifecycle);
  return Object.freeze({
    status: evidence.status,
    version: evidence.package.version,
    byteLength: evidence.package.byteLength,
    sha256: evidence.package.sha256,
    runtimeSha256: evidence.package.runtimeSha256,
  });
}

export async function qualifyFederatedBimSurfaceV03Package() {
  await checkFederatedBimSurfaceV03Bundle();
  const temporary = await mkdtemp(
    path.join(tmpdir(), "federated-bim-surface-v03-package-"),
  );
  try {
    const firstStage = path.join(temporary, "stage-a");
    const secondStage = path.join(temporary, "stage-b");
    await Promise.all([
      stageFederatedBimSurfaceV03Package(firstStage),
      stageFederatedBimSurfaceV03Package(secondStage),
    ]);
    const [first, second] = await Promise.all([
      packFederatedBimSurfacePackage(
        firstStage,
        path.join(temporary, "pack-a"),
      ),
      packFederatedBimSurfacePackage(
        secondStage,
        path.join(temporary, "pack-b"),
      ),
    ]);
    if (
      first.sha256 !== second.sha256 ||
      first.integrity !== second.integrity ||
      first.byteLength !== second.byteLength
    ) {
      throw new Error(
        "Federated BIM surface v0.3 package is not byte-reproducible",
      );
    }
    const ifcArtifact = await createWebIfcSourceArtifact(
      new TextEncoder().encode(syntheticMappedIfc()),
      { profile: "ReferenceView_V1.2" },
    );
    const consumer = await runConsumer(
      first.tarball,
      { ifcArtifact },
      temporary,
    );
    validateConsumer(consumer);
    const runtimeBytes = await readFile(
      path.join(PACKAGE_ROOT, "runtime", "index.mjs"),
    );
    const evidence = {
      schema:
        "bim-explorer-federated-bim-surface-package-qualification/2",
      status: "passed-retained-overlay-release-ready-artifact",
      asOf: "2026-08-15",
      package: {
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        contract: PACKAGE_CONTRACT,
        private: true,
        filename: first.filename,
        byteLength: first.byteLength,
        unpackedSize: first.unpackedSize,
        sha256: first.sha256,
        integrity: first.integrity,
        runtimeSha256: sha256(runtimeBytes),
        files: first.files,
        runtimeDependencies: 0,
      },
      reproducibility: {
        independentPackRuns: 2,
        byteIdentical: true,
        firstSha256: first.sha256,
        secondSha256: second.sha256,
      },
      consumer: {
        install: "offline-local-tarball",
        cleanProject: true,
        lifecycle: consumer,
      },
      releaseGate: {
        expectedTag:
          FEDERATED_BIM_SURFACE_V03_PACKAGE.publicReleaseTag,
        branch: "prerelease",
        artifactOnlyRetainedOverlay: true,
        publicRelease: false,
        publicationAuthorized: true,
      },
      claims: {
        publicRegistryPublication: false,
        publicSurfaceArtifact: false,
        publishedViewerCore013Artifact: false,
        crossPlatformPhysicalGpu: false,
        productionSupport: false,
      },
      authority: Object.fromEntries(
        AUTHORITY_KEYS.map((key) => [key, false]),
      ),
    };
    validateFederatedBimSurfaceV03PackageQualification(evidence);
    return Object.freeze(evidence);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

function outputPath(values) {
  if (values.length === 0) {
    return DEFAULT_OUTPUT;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    typeof values[1] !== "string" ||
    values[1].length === 0
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-federated-bim-surface-v0.3-package.mjs " +
        "[--out <path>]",
    );
  }
  return path.resolve(ROOT, values[1]);
}

async function main() {
  const output = outputPath(process.argv.slice(2));
  const evidence = await qualifyFederatedBimSurfaceV03Package();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, stableJson(evidence), "utf8");
  const metadata = await stat(output);
  process.stdout.write(
    `Federated BIM surface v0.3 package qualification passed: ` +
      `${metadata.size} evidence bytes\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
