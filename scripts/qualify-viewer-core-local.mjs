import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BimMockPickFixture,
  BimMockRenderSource,
  MockViewerHost,
  createBimMockRenderDeltaHarness,
  createMock3dMount,
} from "../packages/viewer-core-consumer/src/index.mjs";

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new TypeError(
        "usage: --viewer-core <absolute module> --conformance <absolute module>",
      );
    }
    parsed[key.slice(2)] = value;
  }
  for (const required of ["viewer-core", "conformance"]) {
    if (!path.isAbsolute(parsed[required] ?? "")) {
      throw new TypeError(`${required} must be an absolute module path`);
    }
  }
  return parsed;
}

async function importFile(file) {
  return import(pathToFileURL(file).href);
}

function pickRequest(runtime) {
  const layer = runtime.snapshot.layers.find(
    (candidate) => candidate.layerId === BimMockPickFixture.layerId,
  );
  if (!layer) {
    throw new Error("BIM 3D layer is missing from the runtime snapshot");
  }
  return Object.freeze({
    protocolVersion: runtime.descriptor.protocolVersion,
    sessionId: runtime.descriptor.sessionId,
    sourceId: layer.sourceId,
    revisionId: runtime.snapshot.revisionId,
    snapshotId: runtime.snapshot.snapshotId,
    layerId: layer.layerId,
    renderId: BimMockPickFixture.renderId,
    pickId: BimMockPickFixture.pickId,
    worldPosition: BimMockPickFixture.worldPosition,
    worldBounds: BimMockPickFixture.worldBounds,
  });
}

async function expectRejected(operation, label) {
  try {
    await operation();
  } catch (error) {
    return Object.freeze({
      label,
      rejected: true,
      code: error?.code ?? error?.name ?? "unknown",
    });
  }
  throw new Error(`${label} did not fail closed`);
}

const arguments_ = parseArguments(process.argv.slice(2));
const core = await importFile(arguments_["viewer-core"]);
const conformance = await importFile(arguments_.conformance);
for (const [module, names] of [
  [core, ["openRenderSource", "openViewerRuntime"]],
  [
    conformance,
    ["runRenderSourceConformance", "runRenderDeltaConformance"],
  ],
]) {
  for (const name of names) {
    if (typeof module[name] !== "function") {
      throw new TypeError(`external Viewer Core module lacks ${name}()`);
    }
  }
}

const lifecycle = await conformance.runRenderSourceConformance(
  () => new BimMockRenderSource(),
);
const delta = await conformance.runRenderDeltaConformance(
  () => createBimMockRenderDeltaHarness(),
);

async function runHostRuntime(kind) {
  const source = new BimMockRenderSource();
  const host = new MockViewerHost({ kind });
  const presentationState = {};
  const runtime = await core.openViewerRuntime(source, {
    host,
    mount: createMock3dMount(presentationState),
  });
  const request = pickRequest(runtime);
  const identity = await runtime.sourceSession.resolvePick(request);
  runtime.handleEvent({
    type: "selection.changed",
    revisionId: identity.revisionId,
    layerId: identity.layerId,
    renderId: identity.renderId,
    externalIdentityToken: identity.externalIdentityToken,
  });
  const stalePick = await expectRejected(
    () => runtime.sourceSession.resolvePick({
      ...request,
      revisionId: "source-snapshot:sha256:stale",
    }),
    `${kind} stale 3D pick`,
  );
  await runtime.dispose();
  await runtime.dispose();
  return Object.freeze({
    kind,
    representation: presentationState.frame.representation,
    snapshotId: presentationState.frame.snapshotId,
    revisionId: presentationState.frame.revisionId,
    cameraProjection: presentationState.frame.camera.projection,
    externalIdentity: identity.externalIdentityToken,
    hostEvents: host.events.length,
    presentationDisposed: presentationState.presentation.disposed,
    hostDisposed: host.disposed,
    sourceDisposed: source.state.disposed,
    stalePick,
  });
}

const hosts = [];
for (const kind of ["browser", "vscode"]) {
  hosts.push(await runHostRuntime(kind));
}

const outOfOrderSource = new BimMockRenderSource({
  snapshotSequences: [2, 1],
});
const outOfOrderSession = await core.openRenderSource(outOfOrderSource);
await outOfOrderSession.getSnapshot();
const outOfOrderSnapshot = await expectRejected(
  () => outOfOrderSession.getSnapshot(),
  "out-of-order 3D snapshot",
);
await outOfOrderSession.dispose();

const report = {
  schema: "bim-explorer-viewer-core-local-probe/1",
  status: "passed-local-workspace-only",
  asOf: new Date().toISOString(),
  modules: {
    viewerCore: arguments_["viewer-core"],
    conformance: arguments_.conformance,
  },
  lifecycle,
  delta,
  threeDimensionalRuntime: {
    hosts,
  },
  failClosed: {
    outOfOrderSnapshot,
  },
  limitations: [
    "uses an absolute sibling-checkout module path",
    "does not prove a durable package or clean install",
    "does not qualify production GPU rendering",
    "does not change unresolved compatibility status",
  ],
};

console.log(JSON.stringify(report, null, 2));
