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
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  BIM_SURFACE_CONTRACT,
  BIM_SURFACE_PACKAGE_VERSION,
  BIM_SURFACE_RECEIPT,
  createBimSurface,
} from "../../packages/bim-surface/src/index.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

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

async function sourceSession() {
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  return {
    session,
    snapshot: await session.getSnapshot(),
    source,
  };
}

test("BIM surface composes source, renderer, semantics, and exact cleanup", async () => {
  const { session, snapshot, source } = await sourceSession();
  const backend = createHeadless3dBackend();
  const workerLease = new WorkerLease();
  const surface = createBimSurface({
    kind: "browser",
    renderer: createBounded3dRenderer({ backend }),
    storage: null,
  });

  assert.deepEqual(surface.state.authority, {
    workspace: false,
    canonicalEntityId: false,
    sourceMutation: false,
    revisionMutation: false,
    acceptance: false,
    publish: false,
    export: false,
  });
  const opened = await surface.open({
    session,
    snapshot,
    workerLease,
  });
  assert.equal(opened.schema, BIM_SURFACE_RECEIPT);
  assert.equal(opened.contract, BIM_SURFACE_CONTRACT);
  assert.equal(
    opened.packageVersion,
    BIM_SURFACE_PACKAGE_VERSION,
  );
  assert.equal(opened.status, "ready");
  assert.equal(
    opened.source.fingerprint,
    snapshot.source.fingerprint,
  );
  assert.equal(
    opened.semantic.initialSelection.expressId,
    40,
  );
  assert.equal(surface.state.lifecycle, "ready");
  assert.equal(
    surface.explorer.state.selection.expressId,
    40,
  );
  const search = await surface.explorer.search("wall");
  assert.equal(search.items.length, 2);
  assert.equal(surface.host.state.activeRangeSession, true);
  assert.ok(backend.state.activeBytes > 0);

  const disposed = await surface.dispose({
    reason: "consumer-close",
  });
  assert.equal(disposed.schema, BIM_SURFACE_RECEIPT);
  assert.equal(disposed.status, "disposed");
  assert.equal(disposed.explorerDisposed, true);
  assert.equal(disposed.hostReceipt.status, "disposed");
  assert.equal(workerLease.disposed, true);
  assert.equal(source.state.sessionDisposed, true);
  assert.equal(backend.state.activeBytes, 0);
  assert.equal(backend.state.disposed, true);
  assert.equal(surface.state.lifecycle, "disposed");
  assert.throws(() => surface.host, /not ready/u);
  assert.equal(await surface.dispose(), false);
  assert.equal(await source.dispose(), true);
});

test("BIM surface rejects stale identity and releases caller resources", async () => {
  const { session, snapshot, source } = await sourceSession();
  const backend = createHeadless3dBackend();
  const workerLease = new WorkerLease();
  const surface = createBimSurface({
    kind: "vscode-webview",
    renderer: createBounded3dRenderer({ backend }),
    storage: null,
  });
  const stale = structuredClone(snapshot);
  stale.revisionId = "source-snapshot:sha256:" + "f".repeat(64);

  await assert.rejects(
    surface.open({
      session,
      snapshot: stale,
      workerLease,
    }),
    /identity or semantic projection is invalid/u,
  );
  assert.equal(surface.state.lifecycle, "failed");
  assert.equal(source.state.sessionDisposed, true);
  assert.equal(workerLease.disposed, true);
  assert.equal(backend.state.disposed, true);
  assert.equal(backend.state.activeBytes, 0);
  assert.equal(await source.dispose(), true);
});
