import assert from "node:assert/strict";
import test from "node:test";

import {
  BimMockPickFixture,
  BimMockRenderDeltaSource,
  BimMockRenderSource,
  Mock3dPresentation,
  MockViewerHost,
  createPerspectiveCamera,
  openBimProductViewerCore,
} from "../../packages/viewer-core-consumer/src/index.mjs";

function productSourceReceipt() {
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const context = {
    protocolVersion: "bim-explorer-bim-source/0.2",
    sessionId: "session:product-test",
    sourceId: "source:product-test",
    revisionId: "revision:product-test",
    snapshotId: "snapshot:product-test",
    layerId: "layer:product-test",
  };
  const rangeHandle = Object.freeze({
    ...context,
    handleId: "range:product-test",
    mediaType: "application/vnd.bim-explorer.geometry-v1",
    byteLength: bytes.byteLength,
    maximumRequestBytes: bytes.byteLength,
    sha256: "a".repeat(64),
    expiresAt: null,
    disposeWithSession: true,
  });
  const snapshot = Object.freeze({
    ...context,
    sequence: 0,
    source: Object.freeze({
      fingerprint: `sha256:${"b".repeat(64)}`,
    }),
    entities: Object.freeze([]),
    layers: Object.freeze([Object.freeze({
      layerId: context.layerId,
      sourceId: context.sourceId,
      revisionId: context.revisionId,
      kind: "reference",
      representation: "3d",
      order: 0,
      visible: true,
      rangeHandles: Object.freeze([rangeHandle]),
    })]),
  });
  const counters = {
    productDisposals: 0,
    rangeBytesRead: 0,
    rangeReads: 0,
    sessionDisposals: 0,
    semanticReads: 0,
    workerDisposals: 0,
  };
  const session = {
    descriptor: Object.freeze({
      protocolVersion: context.protocolVersion,
      sessionId: context.sessionId,
      sourceId: context.sourceId,
      currentRevisionId: context.revisionId,
      lastSuccessfulRevisionId: context.revisionId,
      resourceBudgetBytes: bytes.byteLength,
    }),
    async readRange(handle, offset, length) {
      assert.equal(handle, rangeHandle);
      counters.rangeReads += 1;
      counters.rangeBytesRead += length;
      return bytes.slice(offset, offset + length);
    },
    async getEntity(request) {
      counters.semanticReads += 1;
      return { expressId: request.expressId };
    },
    async getEntityDetails() {
      return {};
    },
    async getPropertySetValues() {
      return {};
    },
    async queryRelations() {
      return {};
    },
    async queryTree() {
      return {};
    },
    async searchEntities() {
      return {};
    },
    async dispose() {
      counters.sessionDisposals += 1;
      return true;
    },
  };
  const workerLease = {
    async dispose() {
      counters.workerDisposals += 1;
      return true;
    },
  };
  return {
    counters,
    opened: {
      session,
      snapshot,
      workerLease,
    },
    rangeHandle,
  };
}

test("BIM mock source exposes one immutable 3D snapshot and bounded range", async () => {
  const source = new BimMockRenderSource();
  const session = await source.open({ protocolVersion: "0.1.0" });
  const snapshot = await session.getSnapshot();

  assert.equal(snapshot.sequence, 0);
  assert.equal(snapshot.layers.length, 1);
  assert.equal(snapshot.layers[0].representation, "3d");
  assert.match(snapshot.revisionId, /^source-snapshot:sha256:/u);
  assert.equal(
    (await session.readRange(
      snapshot.layers[0].rangeHandle,
      0,
      4,
    )).byteLength,
    4,
  );

  const request = {
    protocolVersion: "0.1.0",
    sessionId: session.descriptor.sessionId,
    sourceId: snapshot.layers[0].sourceId,
    revisionId: snapshot.revisionId,
    snapshotId: snapshot.snapshotId,
    layerId: BimMockPickFixture.layerId,
    renderId: BimMockPickFixture.renderId,
    pickId: BimMockPickFixture.pickId,
    worldPosition: BimMockPickFixture.worldPosition,
    worldBounds: BimMockPickFixture.worldBounds,
  };
  const identity = await session.resolvePick(request);
  assert.match(identity.externalIdentityToken, /^ifc-globalid:sha256:/u);

  await session.dispose();
  await source.dispose();
  assert.deepEqual(source.state, {
    opened: true,
    disposed: true,
    sessionDisposed: true,
    sourceDisposals: 1,
    sessionDisposals: 1,
    rangeReads: 1,
    pickResolutions: 1,
  });
});

test("3D presentation keeps camera/backend outside the source", () => {
  const camera = createPerspectiveCamera();
  const presentation = new Mock3dPresentation({
    snapshot: {
      snapshotId: "snapshot:test",
      revisionId: "revision:test",
      layers: [{ representation: "3d" }],
    },
    camera,
  });
  const frame = presentation.render();
  assert.equal(frame.representation, "3d");
  assert.equal(frame.camera.projection, "perspective");
  assert.equal(presentation.dispose(), true);
  assert.equal(presentation.dispose(), false);
  assert.throws(
    () => presentation.render(),
    /disposed/u,
  );
});

test("Browser and VS Code mock Hosts share lifecycle semantics", () => {
  for (const kind of ["browser", "vscode"]) {
    const host = new MockViewerHost({ kind });
    host.handleEvent({
      type: "selection.changed",
      sourceFingerprint: `sha256:${"3".repeat(64)}`,
      renderId: "render:test",
    });
    assert.equal(host.events.length, 1);
    assert.equal(host.dispose(), true);
    assert.equal(host.dispose(), false);
    assert.throws(
      () => host.handleEvent({ type: "selection.changed" }),
      /disposed/u,
    );
  }
});

test("BIM mock delta source emits ordered 3D upsert and tombstone", async () => {
  const source = new BimMockRenderDeltaSource();
  const session = await source.open({ protocolVersion: "0.1.0" });
  const snapshot = await session.getSnapshot();
  assert.equal(snapshot.layers[0].representation, "3d");

  const received = [];
  const subscription = await session.subscribeRenderDeltas((delta) => {
    received.push(delta);
    return { toRevisionId: delta.toRevisionId };
  });
  await source.emitNext();
  await source.emitNext();

  assert.deepEqual(
    received.map((delta) => delta.sequence),
    [1, 2],
  );
  assert.equal(received[0].operations[0].kind, "upsert");
  assert.equal(received[1].operations[0].kind, "tombstone");
  await subscription.dispose();
  await session.dispose();
  await source.dispose();
});

test("actual product entrypoint routes render ranges and selection through public Viewer Core", async () => {
  const fixture = productSourceReceipt();
  let borrowedSession;
  let borrowedWorker;
  const viewer = await openBimProductViewerCore({
    kind: "browser",
    opened: fixture.opened,
    async mountProduct({
      publishSelection,
      session,
      snapshot,
      workerLease,
    }) {
      borrowedSession = session;
      borrowedWorker = workerLease;
      assert.equal(snapshot, fixture.opened.snapshot);
      assert.deepEqual(
        [...await session.readRange(
          fixture.rangeHandle,
          0,
          4,
        )],
        [1, 2, 3, 4],
      );
      assert.deepEqual(
        await session.getEntity({ expressId: 40 }),
        { expressId: 40 },
      );
      publishSelection({
        expressId: 40,
        globalId: "3vYxProduct",
        renderId: "render:40",
      }, {
        reason: "surface-open",
      });
      return {
        async dispose() {
          fixture.counters.productDisposals += 1;
          assert.equal(await session.dispose(), true);
          assert.equal(await workerLease.dispose(), true);
          return true;
        },
      };
    },
  });

  assert.deepEqual(
    {
      adopted: viewer.state.adopted,
      api: viewer.state.api,
      protocolId: viewer.state.protocolId,
      version: viewer.state.version,
    },
    {
      adopted: true,
      api: "menaje-viewer-core/0.1",
      protocolId: "menaje-viewer-render-protocol/0.1.0",
      version: "0.1.2",
    },
  );
  assert.equal(viewer.state.host.eventCount, 1);
  assert.equal(viewer.state.host.lastEventType, "selection.changed");
  assert.equal(viewer.state.source.rangeReads, 1);
  assert.equal(viewer.state.source.rangeBytesRead, 4);
  viewer.publishSelection({
    nativeId: "node:1/mesh:0/primitive:0",
    renderId: "render:reference:1",
  }, {
    reason: "3d",
  });
  assert.equal(viewer.state.host.eventCount, 2);

  await viewer.dispose();
  assert.equal(viewer.state.disposed, true);
  assert.equal(viewer.state.host.disposed, true);
  assert.equal(viewer.state.presentation.disposalStatus, "disposed");
  assert.equal(borrowedSession.state.disposed, true);
  assert.equal(borrowedWorker.state.disposed, true);
  assert.deepEqual(fixture.counters, {
    productDisposals: 1,
    rangeBytesRead: 4,
    rangeReads: 1,
    sessionDisposals: 1,
    semanticReads: 1,
    workerDisposals: 1,
  });
});

test("product Viewer Core mount failure releases the original session and Worker exactly once", async () => {
  const fixture = productSourceReceipt();
  await assert.rejects(
    openBimProductViewerCore({
      kind: "vscode-webview",
      opened: fixture.opened,
      async mountProduct() {
        throw new Error("mount rejected");
      },
    }),
    /mount rejected/u,
  );
  assert.equal(fixture.counters.sessionDisposals, 1);
  assert.equal(fixture.counters.workerDisposals, 1);
});
