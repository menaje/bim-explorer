import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebIfcSourceArtifact,
} from "../../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";
import {
  BIM_RENDERER_3D_HOST_CONTRACT,
  BIM_RENDERER_3D_HOST_RECEIPT,
  createBimRenderer3dHost,
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

class WorkerLease {
  terminations = 0;

  terminate() {
    this.terminations += 1;
  }
}

function sourceBytes(offset) {
  return new TextEncoder().encode(
    syntheticMappedIfc().replace(
      "#22=IFCCARTESIANPOINT((2.,1.,0.));",
      `#22=IFCCARTESIANPOINT((${2 + offset}.,1.,0.));`,
    ),
  );
}

async function sourceSession(offset) {
  const artifact = await createWebIfcSourceArtifact(
    sourceBytes(offset),
  );
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 128,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  return {
    session,
    snapshot: await session.getSnapshot(),
    source,
  };
}

function normalizedTrace(value) {
  return {
    first: {
      schema: value.first.schema,
      status: value.first.status,
      commandSequence: value.first.commandSequence,
      source: value.first.source,
      sourceSwitch: value.first.sourceSwitch,
      rangeIds: value.first.renderer.rangeIds,
      uploadedBytes:
        value.first.renderer.backend.uploadedBytes,
    },
    second: {
      schema: value.second.schema,
      status: value.second.status,
      commandSequence: value.second.commandSequence,
      source: value.second.source,
      sourceSwitch: value.second.sourceSwitch,
      rangeIds: value.second.renderer.rangeIds,
      uploadedBytes:
        value.second.renderer.backend.uploadedBytes,
      priorResources: value.second.priorResources,
    },
    disposal: {
      schema: value.disposal.schema,
      status: value.disposal.status,
      commandSequence: value.disposal.commandSequence,
      reason: value.disposal.reason,
      rendererDisposed: value.disposal.rendererDisposed,
      resources: value.disposal.resources,
    },
    state: {
      disposed: value.state.disposed,
      commands: value.state.commands,
      mounts: value.state.mounts,
      sourceSwitches: value.state.sourceSwitches,
      activeRangeSession: value.state.activeRangeSession,
      activeWorkerLease: value.state.activeWorkerLease,
      rendererDisposed: value.state.renderer.disposed,
      rendererMounts: value.state.renderer.mounts,
      rendererUnmounts: value.state.renderer.unmounts,
      activeBackendBytes:
        value.state.renderer.activeBackendBytes,
    },
  };
}

async function runHost(kind) {
  const firstSource = await sourceSession(0);
  const secondSource = await sourceSession(2);
  const firstWorker = new WorkerLease();
  const secondWorker = new WorkerLease();
  const backend = createHeadless3dBackend();
  const renderer = createBounded3dRenderer({ backend });
  const host = createBimRenderer3dHost({
    kind,
    renderer,
  });

  const first = await host.mount({
    session: firstSource.session,
    snapshot: firstSource.snapshot,
    workerLease: firstWorker,
  });
  const second = await host.mount({
    session: secondSource.session,
    snapshot: secondSource.snapshot,
    workerLease: secondWorker,
  });

  assert.equal(first.schema, BIM_RENDERER_3D_HOST_RECEIPT);
  assert.equal(first.host.contract, BIM_RENDERER_3D_HOST_CONTRACT);
  assert.equal(first.host.kind, kind);
  assert.equal(first.sourceSwitch, false);
  assert.equal(second.sourceSwitch, true);
  assert.equal(firstSource.source.state.sessionDisposed, true);
  assert.equal(firstWorker.terminations, 1);
  assert.equal(backend.state.mounts, 2);
  assert.equal(backend.state.unmounts, 1);

  const stateBeforeDispose = host.state;
  assert.equal(stateBeforeDispose.activeRangeSession, true);
  assert.equal(stateBeforeDispose.activeWorkerLease, true);
  assert.equal(stateBeforeDispose.sourceSwitches, 1);

  const disposal = await host.dispose({
    reason: "editor-exit",
  });
  const state = host.state;
  assert.equal(disposal.reason, "editor-exit");
  assert.equal(secondSource.source.state.sessionDisposed, true);
  assert.equal(secondWorker.terminations, 1);
  assert.equal(backend.state.activeBytes, 0);
  assert.equal(backend.state.disposed, true);
  assert.equal(state.activeRangeSession, false);
  assert.equal(state.activeWorkerLease, false);
  assert.equal(await host.dispose(), false);
  await assert.rejects(
    host.mount({
      session: secondSource.session,
      snapshot: secondSource.snapshot,
    }),
    /disposed/u,
  );
  await firstSource.source.dispose();
  await secondSource.source.dispose();
  return {
    first,
    second,
    disposal,
    state,
  };
}

test("Browser and VS Code Webview share one 3D host contract", async () => {
  const browser = await runHost("browser");
  const vscode = await runHost("vscode-webview");

  assert.deepEqual(
    normalizedTrace(browser),
    normalizedTrace(vscode),
  );
});

test("editor exit waits for an in-flight host command", async () => {
  const gate = Promise.withResolvers();
  const operations = [];
  const renderer = {
    state: {
      disposed: false,
    },
    async mount() {
      operations.push("mount-started");
      await gate.promise;
      operations.push("mount-completed");
      return {
        source: {
          fingerprint: `sha256:${"a".repeat(64)}`,
          revisionId: "revision:queued",
        },
      };
    },
    async renderView() {},
    async pick() {},
    async loadRange() {},
    async evictRange() {},
    async applyRenderDelta() {},
    async unmount() {
      operations.push("renderer-unmounted");
      return false;
    },
    async dispose() {
      operations.push("renderer-disposed");
      this.state.disposed = true;
      return true;
    },
  };
  const session = {
    async readRange() {},
    async dispose() {
      operations.push("session-disposed");
      return true;
    },
  };
  const worker = new WorkerLease();
  const host = createBimRenderer3dHost({
    kind: "browser",
    renderer,
  });
  const mounting = host.mount({
    session,
    snapshot: {},
    workerLease: worker,
  });
  const disposal = host.dispose({
    reason: "editor-exit",
  });

  await Promise.resolve();
  assert.deepEqual(operations, ["mount-started"]);
  gate.resolve();
  await mounting;
  await disposal;
  assert.deepEqual(operations, [
    "mount-started",
    "mount-completed",
    "renderer-disposed",
    "session-disposed",
  ]);
  assert.equal(worker.terminations, 1);
});
