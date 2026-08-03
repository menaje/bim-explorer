import assert from "node:assert/strict";
import test from "node:test";

import {
  BimMockPickFixture,
  BimMockRenderDeltaSource,
  BimMockRenderSource,
  Mock3dPresentation,
  MockViewerHost,
  createPerspectiveCamera,
} from "../../packages/viewer-core-consumer/src/index.mjs";

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
