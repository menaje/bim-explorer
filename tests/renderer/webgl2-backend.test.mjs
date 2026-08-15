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
  createGltfReferenceSource,
} from "../../packages/gltf-reference-source/src/index.mjs";
import {
  BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
  createBounded3dRenderer,
  createFitCamera3d,
  createWebGl2Backend,
  encodeBimRetainedOverlayPacket,
  orbitCamera3d,
  panCamera3d,
  sha256BimRetainedOverlayPacket,
  zoomCamera3d,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  syntheticTexturedGltfExternalBundle,
} from "../../scripts/generate-synthetic-gltf.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

class FakeWebGl2Context {
  ARRAY_BUFFER = 0x8892;
  COLOR_BUFFER_BIT = 0x4000;
  COMPILE_STATUS = 0x8b81;
  CULL_FACE = 0x0b44;
  COLOR_ATTACHMENT0 = 0x8ce0;
  CLAMP_TO_EDGE = 0x812f;
  DEPTH_BUFFER_BIT = 0x0100;
  DEPTH_ATTACHMENT = 0x8d00;
  DEPTH_COMPONENT16 = 0x81a5;
  DEPTH_TEST = 0x0b71;
  DRAW_FRAMEBUFFER = 0x8ca9;
  ELEMENT_ARRAY_BUFFER = 0x8893;
  FLOAT = 0x1406;
  FRAMEBUFFER = 0x8d40;
  FRAMEBUFFER_COMPLETE = 0x8cd5;
  FRAGMENT_SHADER = 0x8b30;
  LEQUAL = 0x0203;
  LINK_STATUS = 0x8b82;
  MAX_VERTEX_ATTRIBS = 0x8869;
  NEAREST = 0x2600;
  NONE = 0;
  NO_ERROR = 0;
  RENDERBUFFER = 0x8d41;
  READ_FRAMEBUFFER = 0x8ca8;
  RGBA = 0x1908;
  SCISSOR_TEST = 0x0c11;
  STATIC_DRAW = 0x88e4;
  SRGB8_ALPHA8 = 0x8c43;
  TEXTURE0 = 0x84c0;
  TEXTURE_2D = 0x0de1;
  TEXTURE_MAG_FILTER = 0x2800;
  TEXTURE_MIN_FILTER = 0x2801;
  TEXTURE_WRAP_S = 0x2802;
  TEXTURE_WRAP_T = 0x2803;
  TRIANGLES = 0x0004;
  UNSIGNED_BYTE = 0x1401;
  UNSIGNED_INT = 0x1405;
  UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243;
  UNPACK_FLIP_Y_WEBGL = 0x9240;
  UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;
  VERSION = 0x1f02;

  constructor() {
    this.bufferUploads = [];
    this.blits = 0;
    this.deletedBuffers = 0;
    this.deletedFramebuffers = 0;
    this.deletedPrograms = 0;
    this.deletedRenderbuffers = 0;
    this.deletedTextures = 0;
    this.drawCalls = 0;
    this.framebuffer = null;
    this.generatedMipmaps = 0;
    this.lost = false;
    this.pickIndex = 0;
    this.scissors = [];
    this.textureUploads = [];
  }

  activeTexture() {}
  attachShader() {}
  bindBuffer() {}
  bindFramebuffer(target, value) {
    this.framebuffer = value;
  }
  bindRenderbuffer() {}
  bindTexture() {}
  blitFramebuffer() {
    this.blits += 1;
  }
  bufferData(target, bytes) {
    this.bufferUploads.push({
      byteLength: bytes.byteLength,
      target,
    });
  }
  clear() {}
  clearColor() {}
  clearDepth() {}
  compileShader() {}
  createBuffer() {
    return {};
  }
  createFramebuffer() {
    return {};
  }
  createProgram() {
    return {};
  }
  createShader() {
    return {};
  }
  createRenderbuffer() {
    return {};
  }
  createTexture() {
    return {};
  }
  deleteBuffer() {
    this.deletedBuffers += 1;
  }
  deleteFramebuffer() {
    this.deletedFramebuffers += 1;
  }
  deleteProgram() {
    this.deletedPrograms += 1;
  }
  deleteShader() {}
  deleteRenderbuffer() {
    this.deletedRenderbuffers += 1;
  }
  deleteTexture() {
    this.deletedTextures += 1;
  }
  depthFunc() {}
  disable() {}
  disableVertexAttribArray() {}
  drawElementsInstanced() {
    this.drawCalls += 1;
  }
  enable() {}
  enableVertexAttribArray() {}
  finish() {}
  framebufferRenderbuffer() {}
  framebufferTexture2D() {}
  generateMipmap() {
    this.generatedMipmaps += 1;
  }
  getError() {
    return this.NO_ERROR;
  }
  getExtension(name) {
    if (name !== "WEBGL_lose_context") {
      return null;
    }
    return {
      loseContext: () => {
        this.lost = true;
        queueMicrotask(() => {
          this.canvas.dispatch("webglcontextlost");
        });
      },
      restoreContext: () => {
        this.lost = false;
        queueMicrotask(() => {
          this.canvas.dispatch("webglcontextrestored");
        });
      },
    };
  }
  getParameter(name) {
    if (name === this.MAX_VERTEX_ATTRIBS) {
      return 16;
    }
    if (name === this.VERSION) {
      return "WebGL 2.0 deterministic test context";
    }
    return null;
  }
  getProgramInfoLog() {
    return "";
  }
  getProgramParameter() {
    return true;
  }
  getShaderInfoLog() {
    return "";
  }
  getShaderParameter() {
    return true;
  }
  checkFramebufferStatus() {
    return this.FRAMEBUFFER_COMPLETE;
  }
  getUniformLocation() {
    return {};
  }
  isContextLost() {
    return this.lost;
  }
  linkProgram() {}
  pixelStorei() {}
  readPixels(
    x,
    y,
    width,
    height,
    format,
    type,
    pixels,
  ) {
    pixels.fill(0);
    if (this.framebuffer === null) {
      pixels[0] = 255;
      pixels[3] = 255;
      return;
    }
    const packed = (
      (16_384 << 17) |
      this.pickIndex
    ) >>> 0;
    pixels[0] = packed & 0xff;
    pixels[1] = (packed >>> 8) & 0xff;
    pixels[2] = (packed >>> 16) & 0xff;
    pixels[3] = (packed >>> 24) & 0xff;
  }
  renderbufferStorage() {}
  scissor(x, y, width, height) {
    this.scissors.push({ height, width, x, y });
  }
  shaderSource() {}
  texImage2D(...values) {
    if (values.length === 6 && values[2] === this.SRGB8_ALPHA8) {
      this.textureUploads.push(values);
    }
  }
  texParameteri() {}
  uniform1i() {}
  uniform1ui(location, value) {
    this.pickIndex = value;
  }
  uniform4fv() {}
  uniformMatrix4fv() {}
  useProgram() {}
  vertexAttribDivisor() {}
  vertexAttrib2f() {}
  vertexAttribPointer() {}
  viewport() {}
}

function fakeCanvas(context) {
  const listeners = new Map();
  const canvas = {
    height: 0,
    width: 0,
    addEventListener(type, listener) {
      const values = listeners.get(type) ?? new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ preventDefault() {}, type });
      }
    },
    getContext(name, options) {
      assert.equal(name, "webgl2");
      assert.equal(options.preserveDrawingBuffer, true);
      return context;
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
  context.canvas = canvas;
  return canvas;
}

test("WebGL2 backend decodes and uploads bounded base color textures", async () => {
  const bundle = syntheticTexturedGltfExternalBundle();
  const source = await createGltfReferenceSource(bundle.bytes, {
    resources: bundle.resources,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const context = new FakeWebGl2Context();
  let closedImages = 0;
  const backend = createWebGl2Backend({
    canvas: fakeCanvas(context),
    frameScheduler(callback) {
      callback(0);
    },
    height: 90,
    imageDecoder(bytes, metadata) {
      assert.deepEqual([...bytes.slice(0, 8)], [
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      assert.equal(metadata.mediaType, "image/png");
      return {
        width: metadata.width,
        height: metadata.height,
        close() {
          closedImages += 1;
        },
      };
    },
    width: 160,
  });
  const renderer = createBounded3dRenderer({ backend });
  const receipt = await renderer.mount({ session, snapshot });

  assert.equal(receipt.metrics.textures, 1);
  assert.equal(receipt.metrics.textureSourceBytes, 76);
  assert.equal(receipt.metrics.textureDecodedBytes, 16);
  assert.equal(receipt.metrics.textureGpuBytes, 20);
  assert.equal(receipt.backend.textureBytes, 20);
  assert.equal(receipt.backend.gpuTextures, 1);
  assert.equal(receipt.backend.uploadedBytes, 288);
  assert.equal(context.textureUploads.length, 1);
  assert.equal(context.generatedMipmaps, 1);
  assert.equal(closedImages, 1);
  assert.deepEqual(
    context.bufferUploads.map((upload) => upload.byteLength),
    [96, 12, 160],
  );
  assert.equal(backend.state.activeBytes, 288);

  const released = await renderer.unmount();
  assert.equal(released.releasedBytes, 288);
  assert.equal(context.deletedTextures, 1);
  assert.equal(await renderer.dispose(), true);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
  bundle.bytes.fill(0);
  for (const resource of bundle.resources) {
    resource.bytes.fill(0);
  }
});

test("WebGL2 backend decodes and uploads bounded JPEG base color textures", async () => {
  const bundle = syntheticTexturedGltfExternalBundle({
    imageUri: "base-color.jpeg",
  });
  const source = await createGltfReferenceSource(bundle.bytes, {
    resources: bundle.resources,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const context = new FakeWebGl2Context();
  let closedImages = 0;
  const backend = createWebGl2Backend({
    canvas: fakeCanvas(context),
    frameScheduler(callback) {
      callback(0);
    },
    height: 90,
    imageDecoder(bytes, metadata) {
      assert.deepEqual([...bytes.slice(0, 2)], [0xff, 0xd8]);
      assert.equal(metadata.mediaType, "image/jpeg");
      return {
        width: metadata.width,
        height: metadata.height,
        close() {
          closedImages += 1;
        },
      };
    },
    width: 160,
  });
  const renderer = createBounded3dRenderer({ backend });
  const receipt = await renderer.mount({ session, snapshot });

  assert.equal(receipt.metrics.textures, 1);
  assert.equal(receipt.metrics.textureSourceBytes, 711);
  assert.equal(receipt.metrics.textureDecodedBytes, 16);
  assert.equal(receipt.metrics.textureGpuBytes, 20);
  assert.equal(receipt.backend.textureBytes, 20);
  assert.equal(context.textureUploads.length, 1);
  assert.equal(context.generatedMipmaps, 1);
  assert.equal(closedImages, 1);
  assert.equal(await renderer.dispose(), true);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
  bundle.bytes.fill(0);
  for (const resource of bundle.resources) {
    resource.bytes.fill(0);
  }
});

test("WebGL2 backend uploads, draws, and releases a bounded plan", async () => {
  const bytes = new TextEncoder().encode(syntheticMappedIfc());
  const artifact = await createWebIfcSourceArtifact(bytes);
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 128,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const context = new FakeWebGl2Context();
  const canvas = fakeCanvas(context);
  const backend = createWebGl2Backend({
    canvas,
    frameScheduler(callback) {
      callback(0);
    },
    height: 90,
    width: 160,
  });
  const renderer = createBounded3dRenderer({ backend });
  const receipt = await renderer.mount({ session, snapshot });

  assert.equal(receipt.backend.backendId, "webgl2");
  assert.equal(receipt.backend.actualGpu, true);
  assert.equal(receipt.backend.rendered, true);
  assert.equal(receipt.backend.frameWidth, 160);
  assert.equal(receipt.backend.frameHeight, 90);
  assert.ok(receipt.backend.nonBackgroundPixels > 0);
  assert.equal(receipt.backend.glError, 0);
  assert.deepEqual(receipt.backend.precision, {
    strategy: "camera-relative-model-origin",
    worldOrigin: [2, 3, 1.5],
    maximumRelativeCoordinate: 2.1,
  });
  assert.equal(context.drawCalls, receipt.metrics.drawCalls);
  assert.deepEqual(
    context.bufferUploads.map((upload) => upload.byteLength),
    [816, 144, 160],
  );
  assert.equal(backend.state.activeBytes, 1_120);
  assert.equal(backend.state.frames, 1);

  const movedCamera = panCamera3d(
    zoomCamera3d(
      orbitCamera3d(receipt.backend.camera, {
        pitch: 0.1,
        yaw: 0.2,
      }),
      0.8,
    ),
    {
      right: 0.01,
      up: -0.02,
    },
  );
  const hiddenRenderId = snapshot.entities[0].renderId;
  const hiddenView = await renderer.renderView({
    camera: movedCamera,
    hiddenRenderIds: [hiddenRenderId],
  });
  assert.equal(hiddenView.viewRevision, 1);
  assert.equal(hiddenView.visibility.hiddenInstances, 1);
  assert.equal(hiddenView.visibility.visibleInstances, 1);
  assert.equal(hiddenView.backend.drawCalls, 1);
  assert.equal(hiddenView.backend.rendered, true);
  assert.equal(backend.state.frames, 2);
  assert.equal(backend.state.hiddenRenderIds, 1);
  assert.equal(context.drawCalls, 3);

  const fittedView = await renderer.renderView({
    camera: createFitCamera3d(snapshot.geometry.bounds, {
      aspect: 16 / 9,
      projection: "orthographic",
    }),
  });
  assert.equal(fittedView.viewRevision, 2);
  assert.equal(fittedView.camera.projection, "orthographic");
  assert.equal(fittedView.visibility.hiddenInstances, 0);
  assert.equal(fittedView.backend.drawCalls, 2);
  assert.equal(renderer.state.viewUpdates, 2);
  assert.equal(backend.state.frames, 3);
  assert.equal(backend.state.hiddenRenderIds, 0);
  assert.equal(context.drawCalls, 5);

  const isolatedView = await renderer.renderView({
    camera: fittedView.camera,
    isolateRenderIds: [snapshot.entities[1].renderId],
  });
  assert.equal(isolatedView.viewRevision, 3);
  assert.equal(isolatedView.visibility.mode, "isolate");
  assert.deepEqual(isolatedView.visibility.isolatedRenderIds, [
    snapshot.entities[1].renderId,
  ]);
  assert.equal(isolatedView.visibility.hiddenInstances, 1);
  assert.equal(isolatedView.visibility.visibleInstances, 1);
  const showAllView = await renderer.renderView({
    camera: fittedView.camera,
  });
  assert.equal(showAllView.viewRevision, 4);
  assert.equal(showAllView.visibility.mode, "show-all");
  assert.deepEqual(showAllView.visibility.hiddenRenderIds, []);
  assert.deepEqual(showAllView.visibility.isolatedRenderIds, []);
  assert.equal(showAllView.visibility.visibleInstances, 2);
  assert.equal(backend.state.frames, 5);
  assert.equal(context.drawCalls, 8);
  await assert.rejects(
    renderer.renderView({
      camera: fittedView.camera,
      hiddenRenderIds: [snapshot.entities[0].renderId],
      isolateRenderIds: [snapshot.entities[1].renderId],
    }),
    /mutually exclusive/u,
  );

  const affectedWorldBounds = {
    min: [0, 0.9, 0],
    max: [2, 1.1, 3],
  };
  const delta = {
    deltaId: "delta:renderer:presentation:1",
    sourceId: snapshot.sourceId,
    fromRevisionId: snapshot.revisionId,
    toRevisionId: snapshot.revisionId,
    sequence: 1,
    operations: [{
      operationId: "operation:renderer:invalidate:1",
      kind: "invalidate",
      aspect: "presentation",
      layerId: snapshot.layerId,
      sourceId: snapshot.sourceId,
      renderIds: [snapshot.entities[0].renderId],
      affectedWorldBounds,
    }],
    affectedWorldBounds,
    payload: null,
  };
  const deltaReceipt = await renderer.applyRenderDelta({
    delta,
  });
  assert.equal(deltaReceipt.status, "applied");
  assert.equal(deltaReceipt.atomic, true);
  assert.equal(deltaReceipt.applied, true);
  assert.equal(deltaReceipt.sequence, 1);
  assert.equal(deltaReceipt.viewRevision, 5);
  assert.equal(
    deltaReceipt.backend.redrawScope,
    "affected-world-bounds",
  );
  assert.ok(deltaReceipt.backend.redrawPixels > 0);
  assert.ok(deltaReceipt.backend.redrawPixels < 160 * 90);
  assert.equal(context.scissors.length, 1);
  assert.equal(renderer.state.deltas, 1);
  assert.equal(backend.state.frames, 6);
  assert.equal(context.drawCalls, 10);
  const unsupportedDelta = structuredClone(delta);
  unsupportedDelta.deltaId = "delta:renderer:geometry:2";
  unsupportedDelta.sequence = 2;
  unsupportedDelta.toRevisionId =
    `${snapshot.revisionId}:next`;
  unsupportedDelta.operations[0].kind = "upsert";
  unsupportedDelta.operations[0].aspect = "geometry";
  unsupportedDelta.payload = {
    mediaType: "application/unsupported",
  };
  const remount = await renderer.applyRenderDelta({
    delta: unsupportedDelta,
  });
  assert.equal(remount.status, "remount-required");
  assert.equal(remount.atomic, true);
  assert.equal(remount.applied, false);
  assert.equal(remount.backend, null);
  assert.equal(renderer.state.deltas, 1);
  await assert.rejects(
    renderer.applyRenderDelta({ delta }),
    /stale or out of order/u,
  );

  const picked = await renderer.pick({
    x: 80,
    y: 45,
  });
  assert.equal(picked.status, "hit");
  assert.equal(picked.source.revisionId, snapshot.revisionId);
  assert.equal(picked.backend.actualGpu, true);
  assert.equal(picked.backend.drawCalls, 2);
  assert.equal(picked.backend.temporaryTargetBytes, 86_400);
  assert.equal(picked.backend.temporaryReleased, true);
  assert.equal(picked.identity.pickId, snapshot.entities[1].pickId);
  assert.equal(renderer.state.picks, 1);
  assert.equal(backend.state.picks, 1);
  assert.equal(context.deletedFramebuffers, 1);
  assert.equal(context.deletedRenderbuffers, 1);
  assert.equal(context.deletedTextures, 1);

  const selectedView = await renderer.renderView({
    camera: fittedView.camera,
    selectedPickIds: [picked.identity.pickId],
  });
  assert.equal(selectedView.viewRevision, 6);
  assert.equal(selectedView.selection.selectedPickIds.length, 1);
  assert.ok(selectedView.selection.selectedInstances >= 1);
  assert.equal(
    selectedView.selection.highlightedInstances,
    selectedView.selection.selectedInstances,
  );
  assert.equal(
    selectedView.backend.highlightedInstances,
    selectedView.selection.highlightedInstances,
  );
  assert.equal(renderer.state.viewUpdates, 5);
  assert.equal(backend.state.frames, 7);
  assert.equal(backend.state.selectedPickIds, 1);
  assert.equal(context.drawCalls, 14);

  const horizontalPick = await renderer.pick({
    x: 60,
    y: 45,
  });
  const verticalPick = await renderer.pick({
    x: 80,
    y: 25,
  });
  const distance = renderer.measure({
    type: "distance",
    picks: [picked, horizontalPick],
  });
  const angle = renderer.measure({
    type: "angle",
    picks: [horizontalPick, picked, verticalPick],
  });
  const area = renderer.measure({
    type: "area",
    picks: [picked, horizontalPick, verticalPick],
  });
  assert.ok(picked.worldPosition.every(Number.isFinite));
  assert.ok(distance.measurement.value > 0);
  assert.ok(angle.measurement.degrees > 0);
  assert.ok(area.measurement.value > 0);
  assert.equal(renderer.state.picks, 3);
  assert.equal(renderer.state.measurements, 3);
  assert.equal(backend.state.picks, 3);
  assert.equal(context.drawCalls, 18);
  const stalePick = structuredClone(picked);
  stalePick.source.revisionId += ":stale";
  assert.throws(
    () => renderer.measure({
      type: "distance",
      picks: [stalePick, horizontalPick],
    }),
    /outside the active revision/u,
  );

  const clippedView = await renderer.renderView({
    camera: fittedView.camera,
    clippingPlanes: [{
      normal: [1, 0, 0],
      constant: -2,
    }],
  });
  assert.equal(clippedView.viewRevision, 7);
  assert.equal(clippedView.clipping.activePlanes, 1);
  assert.equal(clippedView.backend.clippingPlanes, 1);
  const sectionView = await renderer.renderView({
    camera: fittedView.camera,
    sectionBox: {
      min: [0, 0, 0],
      max: [4, 6, 3],
    },
  });
  assert.equal(sectionView.viewRevision, 8);
  assert.equal(sectionView.clipping.activePlanes, 6);
  assert.equal(sectionView.backend.clippingPlanes, 6);
  const restoredAfterSection = await renderer.renderView({
    camera: fittedView.camera,
  });
  assert.equal(restoredAfterSection.viewRevision, 9);
  assert.equal(restoredAfterSection.clipping.activePlanes, 0);
  assert.equal(renderer.state.viewUpdates, 8);
  assert.equal(backend.state.frames, 10);
  assert.equal(backend.state.clippingPlanes, 0);
  assert.equal(context.drawCalls, 24);
  await assert.rejects(
    renderer.renderView({
      camera: fittedView.camera,
      sectionBox: {
        min: [0, 0, 0],
        max: [0, 1, 1],
      },
    }),
    /section box is invalid/u,
  );

  const cancelledPick = new AbortController();
  cancelledPick.abort(
    new DOMException("cancelled pick", "AbortError"),
  );
  await assert.rejects(
    renderer.pick({
      x: 80,
      y: 45,
      signal: cancelledPick.signal,
    }),
    /cancelled pick/u,
  );
  assert.equal(renderer.state.picks, 3);
  assert.equal(backend.state.picks, 3);

  const contextLoss = await backend.qualifyContextLoss(
    backend.state.activeHandleId,
  );
  assert.equal(contextLoss.contextLostObserved, true);
  assert.equal(contextLoss.contextRestoredObserved, true);
  assert.equal(contextLoss.priorGeneration, 1);
  assert.equal(contextLoss.restoredGeneration, 2);
  assert.equal(contextLoss.invalidatedBytes, 1_120);
  assert.equal(contextLoss.recoveryRequired, true);
  assert.deepEqual(contextLoss.clearedErrors, []);
  assert.equal(contextLoss.glError, 0);
  assert.equal(backend.state.contextLosses, 1);
  assert.equal(backend.state.contextGeneration, 2);
  assert.equal(backend.state.contextInvalidated, true);
  await assert.rejects(
    renderer.renderView({
      camera: fittedView.camera,
    }),
    /invalidated by context loss/u,
  );

  await assert.rejects(
    renderer.renderView({
      camera: fittedView.camera,
      hiddenRenderIds: ["render:stale"],
    }),
    /outside the active revision/u,
  );
  await assert.rejects(
    renderer.renderView({
      camera: fittedView.camera,
      selectedPickIds: ["pick:stale"],
    }),
    /outside the active revision/u,
  );

  const released = await renderer.unmount();
  assert.equal(released.releasedBytes, 1_120);
  assert.equal(context.deletedBuffers, 0);
  assert.equal(context.deletedPrograms, 0);
  assert.equal(backend.state.activeBytes, 0);
  assert.equal(backend.state.releasedBytes, 1_120);
  assert.equal(await renderer.dispose(), true);
  assert.equal(backend.state.disposed, true);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
});

test("WebGL2 retained overlay pre-renders offscreen and swaps frame and pick map synchronously", async () => {
  const bytes = new TextEncoder().encode(syntheticMappedIfc());
  const artifact = await createWebIfcSourceArtifact(bytes);
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 128,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  const context = new FakeWebGl2Context();
  const backend = createWebGl2Backend({
    canvas: fakeCanvas(context),
    frameScheduler(callback) {
      callback(0);
    },
    height: 90,
    width: 160,
  });
  const renderer = createBounded3dRenderer({ backend });
  await renderer.mount({ session, snapshot });
  const entity = snapshot.entities[0];
  const primitive = entity.primitives[0];
  const sourceRenderId = "consumer-render:webgl-wall";
  renderer.registerRetainedOverlaySource({
    overlayId: "overlay:webgl-consumer",
    sourceId: "webgl-consumer",
    layerId: "webgl-consumer-layer",
    revisionId: "webgl-consumer-revision:1",
    identities: [{
      sourceRenderId,
      sourcePickId: "consumer-pick:webgl-wall:1",
      renderId: entity.renderId,
      pickId: entity.pickId,
      nativeId: entity.nativeId ?? entity.globalId,
      externalIdentityToken: entity.externalIdentityToken,
      bounds: entity.bounds,
      transform: primitive.transform,
      color: primitive.color,
    }],
  });
  const packet = encodeBimRetainedOverlayPacket({
    deltaId: "delta:webgl-retained:1",
    sourceId: "webgl-consumer",
    layerId: "webgl-consumer-layer",
    fromRevisionId: "webgl-consumer-revision:1",
    toRevisionId: "webgl-consumer-revision:2",
    sequence: 1,
    entries: [{
      operationId: "operation:webgl-retained:1",
      kind: "upsert",
      aspect: "geometry",
      renderId: sourceRenderId,
      pickId: "consumer-pick:webgl-wall:2",
      nativeId: "consumer-native:webgl-wall",
      externalIdentityToken: "consumer-token:webgl-wall",
      bounds: entity.bounds,
      transform: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ],
      color: [0.1, 0.8, 0.4, 1],
      visible: true,
      geometry: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
      },
    }],
  });
  const delta = Object.freeze({
    deltaId: "delta:webgl-retained:1",
    sourceId: "webgl-consumer",
    fromRevisionId: "webgl-consumer-revision:1",
    toRevisionId: "webgl-consumer-revision:2",
    sequence: 1,
    affectedWorldBounds: entity.bounds,
    operations: Object.freeze([{
      operationId: "operation:webgl-retained:1",
      kind: "upsert",
      aspect: "geometry",
      sourceId: "webgl-consumer",
      layerId: "webgl-consumer-layer",
      renderIds: Object.freeze([sourceRenderId]),
      affectedWorldBounds: entity.bounds,
      externalIdentityToken: "consumer-token:webgl-wall",
    }]),
    payload: Object.freeze({
      mediaType: BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
      byteLength: packet.byteLength,
      sha256: await sha256BimRetainedOverlayPacket(packet),
    }),
  });
  const beforeBytes = renderer.state.activeBackendBytes;
  const beforeUploads = context.bufferUploads.length;
  const transaction = await renderer.prepareRetainedOverlayDelta({
    overlayId: "overlay:webgl-consumer",
    delta,
    payloadBytes: packet,
  });

  assert.equal(transaction.receipt.backend.currentFramebufferPreserved, true);
  assert.equal(context.framebuffer, null);
  assert.equal(context.blits, 0);
  assert.equal(renderer.state.activeBackendBytes, beforeBytes);
  assert.deepEqual(
    context.bufferUploads.slice(beforeUploads).map((item) => item.byteLength),
    [72, 12, 80],
  );
  const committed = transaction.commit();
  assert.equal(context.blits, 1);
  assert.equal(committed.backend.actualGpu, true);
  assert.equal(committed.backend.geometryPickRevisionAtomic, true);
  assert.equal(backend.state.retainedCommits, 1);
  assert.equal(backend.state.retainedObjects, 1);
  assert.equal(renderer.state.activeBackendBytes, beforeBytes + 164);

  const picked = await renderer.pick({ x: 80, y: 45 });
  assert.equal(picked.status, "hit");
  assert.equal(
    picked.identity.pickId,
    committed.identities[0].pickId,
  );
  assert.equal(
    committed.identities[0].retainedOverlay.sourceRenderId,
    sourceRenderId,
  );

  const rollbackPacket = encodeBimRetainedOverlayPacket({
    deltaId: "delta:webgl-retained:rollback",
    sourceId: "webgl-consumer",
    layerId: "webgl-consumer-layer",
    fromRevisionId: "webgl-consumer-revision:2",
    toRevisionId: "webgl-consumer-revision:3",
    sequence: 2,
    entries: [{
      operationId: "operation:webgl-retained:rollback",
      kind: "upsert",
      aspect: "style",
      renderId: sourceRenderId,
      externalIdentityToken: "consumer-token:webgl-wall",
      bounds: entity.bounds,
      color: [0.9, 0.1, 0.2, 1],
      visible: false,
    }],
  });
  const rollbackDelta = Object.freeze({
    deltaId: "delta:webgl-retained:rollback",
    sourceId: "webgl-consumer",
    fromRevisionId: "webgl-consumer-revision:2",
    toRevisionId: "webgl-consumer-revision:3",
    sequence: 2,
    affectedWorldBounds: entity.bounds,
    operations: Object.freeze([{
      operationId: "operation:webgl-retained:rollback",
      kind: "upsert",
      aspect: "style",
      sourceId: "webgl-consumer",
      layerId: "webgl-consumer-layer",
      renderIds: Object.freeze([sourceRenderId]),
      affectedWorldBounds: entity.bounds,
      externalIdentityToken: "consumer-token:webgl-wall",
    }]),
    payload: Object.freeze({
      mediaType: BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
      byteLength: rollbackPacket.byteLength,
      sha256: await sha256BimRetainedOverlayPacket(rollbackPacket),
    }),
  });
  const rollbackTransaction =
    await renderer.prepareRetainedOverlayDelta({
      overlayId: "overlay:webgl-consumer",
      delta: rollbackDelta,
      payloadBytes: rollbackPacket,
    });
  assert.equal(context.framebuffer, null);
  assert.equal(context.blits, 1);
  assert.equal(
    renderer.state.activeBackendBytes,
    committed.activeBackendBytes,
  );
  assert.equal((await rollbackTransaction.rollback()).rolledBack, true);
  assert.equal(context.blits, 1);
  assert.equal(backend.state.retainedRollbacks, 1);
  assert.equal(
    renderer.retainedOverlaySnapshot({
      overlayId: "overlay:webgl-consumer",
    }).revisionId,
    "webgl-consumer-revision:2",
  );
  const pickedAfterRollback = await renderer.pick({ x: 80, y: 45 });
  assert.equal(pickedAfterRollback.status, "hit");
  assert.equal(
    pickedAfterRollback.identity.pickId,
    committed.identities[0].pickId,
  );

  const released = await renderer.unmount();
  assert.equal(released.releasedBytes, beforeBytes + 164);
  assert.equal(context.deletedBuffers, 7);
  assert.equal(await renderer.dispose(), true);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
});
