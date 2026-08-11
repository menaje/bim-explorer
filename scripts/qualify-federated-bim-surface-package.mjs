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
  syntheticGlbBytes,
} from "./generate-synthetic-gltf.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";
import {
  checkFederatedBimSurfaceBundle,
} from "./build-federated-bim-surface.mjs";
import {
  SPATIAL_CONSUMER_EVIDENCE_PATH,
  SPATIAL_RELEASE_READY_CONSUMER_EVIDENCE_PATH,
  validateSpatialConsumerAdmission,
  validateSpatialReleaseReadyConsumerAdmission,
} from "./federated-bim-surface-spatial-consumer-evidence.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGE_ROOT = path.join(
  ROOT,
  "packages",
  "federated-bim-surface",
);
const PACKAGE_NAME = "@bim-explorer/federated-bim-surface";
const PACKAGE_VERSION = "0.2.0";
const PACKAGE_CONTRACT = "bim-explorer-bim-surface/0.2";
export const FEDERATED_BIM_SURFACE_PACKAGE = Object.freeze({
  name: PACKAGE_NAME,
  version: PACKAGE_VERSION,
  contract: PACKAGE_CONTRACT,
  publicReleaseTag: "bim-surface-v0.2.0",
});
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "compatibility",
  "evidence",
  "federated-bim-surface-package-release-ready-2026-08-11.json",
);
const EXPECTED_FILES = Object.freeze([
  "LICENSE",
  "NOTICE",
  "README.md",
  "SOURCE_OFFER.md",
  "package.json",
  "runtime/index.mjs",
]);
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function equalJson(left, right) {
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

export async function stageFederatedBimSurfacePackage(destination) {
  await mkdir(path.join(destination, "runtime"), {
    recursive: true,
  });
  const manifest = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    private: true,
    description:
      "Host-neutral read-only federated BIM exploration surface",
    license: "MPL-2.0",
    repository: {
      type: "git",
      url: "git+https://github.com/menaje/bim-explorer.git",
      directory: "packages/federated-bim-surface",
    },
    homepage: "https://github.com/menaje/bim-explorer#readme",
    bugs: {
      url: "https://github.com/menaje/bim-explorer/issues",
    },
    type: "module",
    exports: "./runtime/index.mjs",
    files: [
      "runtime/index.mjs",
      "README.md",
      "LICENSE",
      "NOTICE",
      "SOURCE_OFFER.md",
    ],
    sideEffects: false,
    engines: {
      node: ">=24",
    },
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

export async function packFederatedBimSurfacePackage(
  stage,
  destination,
) {
  await mkdir(destination, { recursive: true });
  const output = run(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--offline",
      "--pack-destination",
      destination,
    ],
    { cwd: stage },
  );
  const report = JSON.parse(output)[0];
  const tarball = path.join(destination, report.filename);
  const bytes = await readFile(tarball);
  const files = report.files.map((file) => file.path).sort();
  if (!equalJson(files, EXPECTED_FILES)) {
    throw new Error(
      "Federated BIM surface package inventory is invalid: " +
        JSON.stringify(files),
    );
  }
  return Object.freeze({
    byteLength: bytes.byteLength,
    files,
    filename: report.filename,
    integrity: report.integrity,
    sha256: sha256(bytes),
    tarball,
    unpackedSize: report.unpackedSize,
  });
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

class WorkerLease {
  disposed = false;

  async dispose() {
    if (this.disposed) {
      return false;
    }
    this.disposed = true;
    return true;
  }
}

class PackagePickBackend {
  active = null;
  disposed = false;
  mounts = 0;
  picks = 0;

  get state() {
    return Object.freeze({
      activeBytes: this.active?.uploadedBytes ?? 0,
      disposed: this.disposed,
      mounts: this.mounts,
      picks: this.picks,
    });
  }

  async mount(plan) {
    this.mounts += 1;
    const identities = plan.instances.map((instance) => ({
      expressId: instance.expressId,
      globalId: instance.globalId,
      nativeId: instance.nativeId,
      renderId: instance.renderId,
      pickId: instance.pickId,
      externalIdentityToken: instance.externalIdentityToken,
    }));
    const pickOrder = [0, 1, 2].map((sourceIndex) =>
      identities.find((identity) =>
        identity.nativeId.startsWith(
          "federated:" + sourceIndex + ":",
        ),
      ));
    if (pickOrder.some((identity) => identity === undefined)) {
      throw new Error("package consumer pick identities are incomplete");
    }
    const uploadedBytes =
      plan.metrics.geometryPayloadBytes + plan.metrics.instanceBytes;
    this.active = {
      handleId: "package-pick:" + this.mounts,
      identities,
      pickOrder,
      uploadedBytes,
    };
    return {
      handleId: this.active.handleId,
      receipt: {
        backendId: "package-pick",
        frameId: "mount:" + this.mounts,
        rendered: false,
        geometryBytes: plan.metrics.geometryPayloadBytes,
        instanceBytes: plan.metrics.instanceBytes,
        uploadedBytes,
        drawCalls: plan.metrics.drawCalls,
      },
    };
  }

  async pick(handleId, { x, y }) {
    if (handleId !== this.active?.handleId) {
      throw new Error("package consumer mount is not active");
    }
    const identity = this.active.pickOrder[
      this.picks % this.active.pickOrder.length
    ];
    this.picks += 1;
    return {
      receipt: {
        backendId: "package-pick",
        frameId: "pick:" + this.picks,
        hit: true,
        x,
        y,
        drawCalls: this.active.identities.length,
        temporaryTargetBytes: 16,
        temporaryReleased: true,
        frameMs: 0,
        glError: 0,
        identity,
        depth: 0.5,
        worldPosition: [0, 0, 0],
      },
    };
  }

  async unmount(handleId) {
    if (handleId !== this.active?.handleId) {
      throw new Error("package consumer mount is not active");
    }
    const releasedBytes = this.active.uploadedBytes;
    this.active = null;
    return { released: true, releasedBytes };
  }

  async dispose() {
    if (this.disposed) {
      return false;
    }
    this.active = null;
    this.disposed = true;
    return true;
  }
}

function alignment(snapshot, index) {
  return surfacePackage.createExplicitAlignment({
    sourceRevisionId: snapshot.revisionId,
    sourceCoordinateSystem: snapshot.coordinateSystem.source,
    federationCoordinateSystem: "federation-local",
    sourceToFederation: IDENTITY,
    reference: "package-candidate:source:" + index,
  });
}

function nativeSelection(federationSourceId, snapshot) {
  const entity = snapshot.entities.find((item) => item.renderable === true);
  const nativeIdentity = entity.nativeId === undefined
    ? {
        expressId: entity.expressId,
        globalId: entity.globalId,
        externalIdentityToken: entity.externalIdentityToken,
      }
    : {
        nativeId: entity.nativeId,
        globalId: null,
        externalIdentityToken: entity.externalIdentityToken,
      };
  return {
    federationSourceId,
    sourceRevisionId: snapshot.revisionId,
    nativeIdentity,
    occurrencePath: [],
  };
}

const sourceObjects = [
  await surfacePackage.createGltfReferenceSource(fixture.referenceGlb),
  surfacePackage.createBimModelSource(fixture.ifcArtifact),
  await surfacePackage.createGltfReferenceSource(fixture.overlayGlb),
];
const openedSources = [];
for (const source of sourceObjects) {
  const session = await source.open({
    protocolVersion: surfacePackage.BIM_SOURCE_PROTOCOL_VERSION,
  });
  openedSources.push({
    session,
    snapshot: await session.getSnapshot(),
  });
}
const sourceSlots = [
  "source-slot:a-reference",
  "source-slot:m-semantic",
  "source-slot:z-overlay",
];
const sourceRoles = [
  "geometric-reference",
  "semantic-base",
  "consumer-overlay",
];
const workers = sourceSlots.map(() => new WorkerLease());
const backend = new PackagePickBackend();
const renderer = surfacePackage.createBounded3dRenderer({
  backend,
  limits: { maximumFirstFrameRanges: 3 },
});
const surface = surfacePackage.createFederatedBimSurface({ renderer });
const opened = await surface.open({
  federationId: "federation:package-candidate-v0.2",
  sources: openedSources.map((source, index) => ({
    federationSourceId: sourceSlots[index],
    sourceRole: sourceRoles[index],
    lifecycleOwnership: "transferred",
    session: source.session,
    snapshot: source.snapshot,
    alignment: alignment(source.snapshot, index),
    discipline: sourceRoles[index],
    owner: "package-candidate-consumer",
    workerLease: workers[index],
  })),
});
const search = await surface.search({
  federationSourceId: sourceSlots[1],
  query: "wall",
});
let referenceSemanticsRejected = false;
try {
  surface.getSemanticExplorer(sourceSlots[0]);
} catch (error) {
  referenceSemanticsRejected = error.name === "NotSupportedError";
}
const selection = surface.createSelection({
  items: openedSources.map((source, index) =>
    nativeSelection(sourceSlots[index], source.snapshot)),
});
const anchors = [];
for (let index = 0; index < sourceSlots.length; index += 1) {
  const pick = await surface.pick({ x: index + 1, y: index + 1 });
  const created = await surface.createAnchor({
    pick,
    sourceLocalHit: {
      coordinateSpace: "source-local",
      point: [0, 0, 0],
      normal: [0, 0, 1],
    },
    stability: "point-only",
  });
  anchors.push(created.anchor);
}
const savedView = surface.saveView({
  viewId: "view:package-candidate",
  camera: { projection: "perspective" },
});
const disposal = await surface.dispose({
  reason: "package-candidate-consumer-close",
});
const repeatedDispose = await surface.dispose();
const sourceStates = sourceObjects.map((source) => source.state);
const sourceDisposals = [];
for (const source of sourceObjects) {
  sourceDisposals.push(await source.dispose());
}
const requiredExports = [
  "BIM_FEDERATED_SURFACE_PACKAGE_VERSION",
  "BIM_SOURCE_PROTOCOL_VERSION",
  "createBimModelSource",
  "createBimSurfaceHitRenderer",
  "createBounded3dRenderer",
  "createExplicitAlignment",
  "createFederatedBimSurface",
  "createGltfReferenceSource",
  "createWebGl2Backend",
];

process.stdout.write(JSON.stringify({
  packageVersion: surfacePackage.BIM_FEDERATED_SURFACE_PACKAGE_VERSION,
  contract: surfacePackage.BIM_FEDERATED_SURFACE_CONTRACT,
  receipt: opened.schema,
  exports: {
    count: Object.keys(surfacePackage).length,
    required: Object.fromEntries(requiredExports.map((name) => [
      name,
      Object.hasOwn(surfacePackage, name),
    ])),
  },
  composition: {
    federationId: opened.federationId,
    sourceCount: opened.sources.length,
    formats: opened.sources.map((source) => source.format),
    sourceRoles: opened.sources.map((source) => source.sourceRole),
    semanticAvailability: opened.sources.map((source) =>
      source.semanticAvailable),
    projectionFingerprint: opened.projection.fingerprint,
  },
  semantics: {
    queriedSource: sourceSlots[1],
    returned: search.items.length,
    referenceSemanticsRejected,
  },
  selection: {
    items: selection.items.length,
    distinctKeys: new Set(selection.items.map((item) => item.key)).size,
    savedView: savedView.schema,
  },
  anchors: anchors.map((anchor) => ({
    schema: anchor.schema,
    sourceSlot: anchor.federationSourceId,
    stability: anchor.stability,
    authority: anchor.authority,
  })),
  renderer: {
    uploadedBytes: opened.mount.backend.uploadedBytes,
    sourceReadBytes: opened.mount.metrics.sourceReadBytes,
    mounts: backend.state.mounts,
    picks: backend.state.picks,
  },
  authority: opened.authority,
  cleanup: {
    status: disposal.status,
    rendererDisposed: disposal.cleanup.rendererDisposed,
    projectionsDisposed: disposal.cleanup.projectionReceipts.every(Boolean),
    sourceReceipts: disposal.cleanup.sourceReceipts.length,
    workersDisposed: workers.every((worker) => worker.disposed),
    sessionsDisposed: sourceStates.every((state) => state.sessionDisposed),
    sourceObjectsDisposed: sourceDisposals.every(Boolean),
    backendDisposed: backend.state.disposed,
    backendActiveBytes: backend.state.activeBytes,
    repeatedDispose,
  },
}));
`;

async function runConsumer(tarball, fixture, temporary) {
  const consumer = path.join(temporary, "consumer");
  await mkdir(consumer, { recursive: true });
  await writeFile(
    path.join(consumer, "package.json"),
    stableJson({
      name: "federated-bim-surface-clean-install-consumer",
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
  const installedManifest = JSON.parse(await readFile(
    path.join(
      consumer,
      "node_modules",
      "@bim-explorer",
      "federated-bim-surface",
      "package.json",
    ),
    "utf8",
  ));
  if (
    installedManifest.name !== PACKAGE_NAME ||
    installedManifest.version !== PACKAGE_VERSION ||
    installedManifest.private !== true ||
    installedManifest.exports !== "./runtime/index.mjs" ||
    Object.keys(installedManifest.dependencies ?? {}).length !== 0
  ) {
    throw new Error(
      "clean-installed federated BIM surface manifest is invalid",
    );
  }
  return JSON.parse(run(process.execPath, ["consumer.mjs"], {
    cwd: consumer,
  }));
}

function assertAllFalse(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    !equalJson(Object.keys(value), keys) ||
    Object.values(value).some((item) => item !== false)
  ) {
    throw new Error(`${label} overclaims authority`);
  }
}

function assertConsumer(report) {
  if (
    report.packageVersion !== PACKAGE_VERSION ||
    report.contract !== PACKAGE_CONTRACT ||
    report.receipt !== "bim-explorer-bim-surface-receipt/0.2" ||
    !Number.isSafeInteger(report.exports?.count) ||
    report.exports.count < 80 ||
    Object.values(report.exports.required ?? {}).some(
      (value) => value !== true,
    ) ||
    !equalJson(report.composition?.formats, ["glb", "ifc", "glb"]) ||
    !equalJson(report.composition?.sourceRoles, [
      "geometric-reference",
      "semantic-base",
      "consumer-overlay",
    ]) ||
    !equalJson(report.composition?.semanticAvailability, [
      false,
      true,
      false,
    ]) ||
    report.composition.sourceCount !== 3 ||
    !/^sha256:[0-9a-f]{64}$/u.test(
      report.composition.projectionFingerprint ?? "",
    ) ||
    report.semantics?.queriedSource !== "source-slot:m-semantic" ||
    report.semantics.returned !== 2 ||
    report.semantics.referenceSemanticsRejected !== true ||
    report.selection?.items !== 3 ||
    report.selection.distinctKeys !== 3 ||
    report.selection.savedView !==
      "bim-explorer-bim-surface-saved-view/0.2" ||
    !Array.isArray(report.anchors) ||
    report.anchors.length !== 3 ||
    report.anchors.some((anchor, index) =>
      anchor.schema !== "bim-explorer-reference-anchor/0.1" ||
      anchor.sourceSlot !== [
        "source-slot:a-reference",
        "source-slot:m-semantic",
        "source-slot:z-overlay",
      ][index] ||
      anchor.stability !== "point-only" ||
      Object.values(anchor.authority ?? {}).some(Boolean)) ||
    !(report.renderer?.uploadedBytes > 0) ||
    !(report.renderer?.sourceReadBytes > 0) ||
    report.renderer.mounts !== 1 ||
    report.renderer.picks !== 3 ||
    !equalJson(report.cleanup, {
      status: "disposed",
      rendererDisposed: true,
      projectionsDisposed: true,
      sourceReceipts: 3,
      workersDisposed: true,
      sessionsDisposed: true,
      sourceObjectsDisposed: true,
      backendDisposed: true,
      backendActiveBytes: 0,
      repeatedDispose: false,
    })
  ) {
    throw new Error(
      "clean-installed federated BIM surface conformance failed: " +
        JSON.stringify(report),
    );
  }
  assertAllFalse(
    report.authority,
    AUTHORITY_KEYS,
    "clean-installed federated BIM surface",
  );
}

export function validateFederatedBimSurfacePackageQualification(
  evidence,
) {
  if (
    evidence?.schema !==
      "bim-explorer-federated-bim-surface-package-qualification/1" ||
    evidence.status !==
      "passed-release-ready-candidate-consumer-revalidated" ||
    evidence.asOf !== "2026-08-11" ||
    evidence.package?.name !== PACKAGE_NAME ||
    evidence.package.version !== PACKAGE_VERSION ||
    evidence.package.contract !== PACKAGE_CONTRACT ||
    evidence.package.private !== true ||
    evidence.package.runtimeDependencies !== 0 ||
    evidence.package.filename !==
      "bim-explorer-federated-bim-surface-0.2.0.tgz" ||
    !Number.isSafeInteger(evidence.package.byteLength) ||
    evidence.package.byteLength <= 0 ||
    !Number.isSafeInteger(evidence.package.unpackedSize) ||
    evidence.package.unpackedSize <= evidence.package.byteLength ||
    !/^[0-9a-f]{64}$/u.test(evidence.package.sha256 ?? "") ||
    !/^[0-9a-f]{64}$/u.test(
      evidence.package.runtimeSha256 ?? "",
    ) ||
    !/^sha512-[A-Za-z0-9+/]+=*$/u.test(
      evidence.package.integrity ?? "",
    ) ||
    !equalJson(evidence.package.files, EXPECTED_FILES) ||
    !equalJson(evidence.reproducibility, {
      independentPackRuns: 2,
      byteIdentical: true,
      firstSha256: evidence.package.sha256,
      secondSha256: evidence.package.sha256,
    }) ||
    evidence.consumer?.install !== "offline-local-tarball" ||
    evidence.consumer.cleanProject !== true ||
    evidence.productComposition?.browserUsesCandidateRuntime !== true ||
    evidence.productComposition.vscodeUsesCandidateRuntime !== true ||
    evidence.productComposition.vscodeStagesCandidateRuntime !== true ||
    evidence.claims?.publicRegistryPublication !== false ||
    evidence.claims.immutablePublicReleaseAsset !== false ||
    evidence.claims.actualSpatialConsumerConformance !== true ||
    evidence.claims.releaseReadyPackageConsumerRevalidation !== true ||
    evidence.claims.publicArtifactSpatialAdmission !== false ||
    evidence.claims.productionSupport !== false ||
    evidence.releaseGate?.expectedTag !==
      FEDERATED_BIM_SURFACE_PACKAGE.publicReleaseTag ||
    evidence.releaseGate.branch !== "prerelease" ||
    evidence.releaseGate.actualSpatialConsumer !== true ||
    evidence.releaseGate.releaseReadyPackageConsumerRevalidation !==
      true ||
    evidence.releaseGate.publicRelease !== false ||
    evidence.releaseGate.publicationAuthorized !== true ||
    evidence.spatialConsumer?.evidence !==
      SPATIAL_CONSUMER_EVIDENCE_PATH ||
    evidence.spatialConsumer.status !==
      "passed-private-candidate-actual-consumer" ||
    evidence.spatialConsumer.releaseReadyEvidence !==
      SPATIAL_RELEASE_READY_CONSUMER_EVIDENCE_PATH ||
    evidence.spatialConsumer.releaseReadyStatus !==
      "passed-release-ready-package-consumer-revalidation" ||
    evidence.spatialConsumer.releaseReadySourceCommit !==
      "ef0c1ea80dae3b5696274542a0e0ff9f263ae4e5" ||
    evidence.spatialConsumer.releaseReadyPackageSourceCommit !==
      "94c3c29927cec4539f7f77ad000dd6eb373f14cd" ||
    evidence.spatialConsumer.releaseReadyPackageSha256 !==
      evidence.package.sha256 ||
    evidence.spatialConsumer.priorCandidatePackageSha256 ===
      evidence.package.sha256 ||
    evidence.spatialConsumer.runtimeUnchanged !== true
  ) {
    throw new Error(
      "federated BIM surface package qualification is invalid",
    );
  }
  assertConsumer(evidence.consumer.lifecycle);
  assertAllFalse(
    evidence.authority,
    AUTHORITY_KEYS,
    "federated BIM surface package",
  );
  return Object.freeze({
    status: evidence.status,
    version: evidence.package.version,
    byteLength: evidence.package.byteLength,
    sha256: evidence.package.sha256,
    runtimeSha256: evidence.package.runtimeSha256,
  });
}

export async function qualifyFederatedBimSurfacePackage() {
  await checkFederatedBimSurfaceBundle();
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
      "federated BIM surface repository package boundary is invalid",
    );
  }
  const spatialConsumerEvidence = JSON.parse(await readFile(
    path.join(ROOT, SPATIAL_CONSUMER_EVIDENCE_PATH),
    "utf8",
  ));
  const spatialConsumer = validateSpatialConsumerAdmission(
    spatialConsumerEvidence,
  );
  const spatialReleaseReadyConsumerEvidence = JSON.parse(
    await readFile(
      path.join(ROOT, SPATIAL_RELEASE_READY_CONSUMER_EVIDENCE_PATH),
      "utf8",
    ),
  );
  const spatialReleaseReadyConsumer =
    validateSpatialReleaseReadyConsumerAdmission(
      spatialReleaseReadyConsumerEvidence,
    );
  const temporary = await mkdtemp(
    path.join(tmpdir(), "federated-bim-surface-package-"),
  );
  try {
    const firstStage = path.join(temporary, "stage-a");
    const secondStage = path.join(temporary, "stage-b");
    await Promise.all([
      stageFederatedBimSurfacePackage(firstStage),
      stageFederatedBimSurfacePackage(secondStage),
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
        "Federated BIM surface package is not byte-reproducible",
      );
    }
    if (
      first.sha256 !== spatialReleaseReadyConsumer.packageSha256 ||
      first.byteLength !== spatialReleaseReadyConsumer.packageBytes
    ) {
      throw new Error(
        "Federated BIM surface package differs from the exact-byte " +
          "Spatial release-ready admission",
      );
    }
    const ifcArtifact = await createWebIfcSourceArtifact(
      new TextEncoder().encode(syntheticMappedIfc()),
      { profile: "ReferenceView_V1.2" },
    );
    const consumer = await runConsumer(
      first.tarball,
      {
        ifcArtifact,
        referenceGlb: syntheticGlbBytes({ secondNodeX: 3 }),
        overlayGlb: syntheticGlbBytes({ secondNodeX: 6 }),
      },
      temporary,
    );
    assertConsumer(consumer);
    const [browserSource, vscodeSource, vscodePackaging, runtimeBytes] =
      await Promise.all([
        readFile(
          path.join(
            ROOT,
            "apps",
            "federated-bim-surface-browser-probe",
            "app.mjs",
          ),
          "utf8",
        ),
        readFile(
          path.join(
            ROOT,
            "apps",
            "federated-bim-surface-vscode",
            "app.mjs",
          ),
          "utf8",
        ),
        readFile(
          path.join(ROOT, "scripts", "package-vscode-extension.mjs"),
          "utf8",
        ),
        readFile(path.join(PACKAGE_ROOT, "runtime", "index.mjs")),
      ]);
    const runtimeImport =
      "packages/federated-bim-surface/runtime/index.mjs";
    if (
      !browserSource.includes(runtimeImport) ||
      !vscodeSource.includes(runtimeImport) ||
      !vscodePackaging.includes(runtimeImport)
    ) {
      throw new Error(
        "Browser and VS Code products do not consume the v0.2 runtime",
      );
    }
    const evidence = {
      schema:
        "bim-explorer-federated-bim-surface-package-qualification/1",
      status:
        "passed-release-ready-candidate-consumer-revalidated",
      asOf: "2026-08-11",
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
      productComposition: {
        browserEntrypoint:
          "apps/federated-bim-surface-browser-probe/app.mjs",
        browserUsesCandidateRuntime: true,
        vscodeEntrypoint:
          "apps/federated-bim-surface-vscode/app.mjs",
        vscodeUsesCandidateRuntime: true,
        vscodeStagesCandidateRuntime: true,
      },
      authority: Object.fromEntries(
        AUTHORITY_KEYS.map((key) => [key, false]),
      ),
      claims: {
        publicRegistryPublication: false,
        immutablePublicReleaseAsset: false,
        actualSpatialConsumerConformance: true,
        releaseReadyPackageConsumerRevalidation: true,
        publicArtifactSpatialAdmission: false,
        productionSupport: false,
      },
      spatialConsumer: {
        evidence: SPATIAL_CONSUMER_EVIDENCE_PATH,
        status: spatialConsumer.status,
        sourceCommit: spatialConsumer.sourceCommit,
        priorCandidatePackageSha256: spatialConsumer.packageSha256,
        releaseReadyEvidence:
          SPATIAL_RELEASE_READY_CONSUMER_EVIDENCE_PATH,
        releaseReadyStatus: spatialReleaseReadyConsumer.status,
        releaseReadySourceCommit:
          spatialReleaseReadyConsumer.sourceCommit,
        releaseReadyPackageSourceCommit:
          spatialReleaseReadyConsumer.packageSourceCommit,
        releaseReadyPackageSha256: first.sha256,
        runtimeSha256: spatialConsumer.runtimeSha256,
        runtimeUnchanged:
          spatialConsumer.runtimeSha256 === sha256(runtimeBytes),
      },
      releaseGate: {
        expectedTag:
          FEDERATED_BIM_SURFACE_PACKAGE.publicReleaseTag,
        branch: "prerelease",
        actualSpatialConsumer: true,
        releaseReadyPackageConsumerRevalidation: true,
        publicRelease: false,
        publicationAuthorized: true,
      },
    };
    validateFederatedBimSurfacePackageQualification(evidence);
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
      "usage: node scripts/qualify-federated-bim-surface-package.mjs " +
        "[--out <path>]",
    );
  }
  return path.resolve(ROOT, values[1]);
}

async function main() {
  const output = outputPath(process.argv.slice(2));
  const evidence = await qualifyFederatedBimSurfacePackage();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, stableJson(evidence), "utf8");
  const metadata = await stat(output);
  process.stdout.write(
    `Federated BIM surface package qualification passed: ` +
      `${metadata.size} evidence bytes\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
