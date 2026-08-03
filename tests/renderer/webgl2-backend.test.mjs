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
  createFitCamera3d,
  createWebGl2Backend,
  orbitCamera3d,
  panCamera3d,
  zoomCamera3d,
} from "../../packages/bim-renderer-3d/src/index.mjs";
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
  ELEMENT_ARRAY_BUFFER = 0x8893;
  FLOAT = 0x1406;
  FRAMEBUFFER = 0x8d40;
  FRAMEBUFFER_COMPLETE = 0x8cd5;
  FRAGMENT_SHADER = 0x8b30;
  LEQUAL = 0x0203;
  LINK_STATUS = 0x8b82;
  MAX_VERTEX_ATTRIBS = 0x8869;
  NEAREST = 0x2600;
  NO_ERROR = 0;
  RENDERBUFFER = 0x8d41;
  RGBA = 0x1908;
  STATIC_DRAW = 0x88e4;
  TEXTURE_2D = 0x0de1;
  TEXTURE_MAG_FILTER = 0x2800;
  TEXTURE_MIN_FILTER = 0x2801;
  TEXTURE_WRAP_S = 0x2802;
  TEXTURE_WRAP_T = 0x2803;
  TRIANGLES = 0x0004;
  UNSIGNED_BYTE = 0x1401;
  UNSIGNED_INT = 0x1405;
  VERSION = 0x1f02;

  constructor() {
    this.bufferUploads = [];
    this.deletedBuffers = 0;
    this.deletedFramebuffers = 0;
    this.deletedPrograms = 0;
    this.deletedRenderbuffers = 0;
    this.deletedTextures = 0;
    this.drawCalls = 0;
    this.framebuffer = null;
    this.pickColor = [0, 0, 0];
  }

  attachShader() {}
  bindBuffer() {}
  bindFramebuffer(target, value) {
    this.framebuffer = value;
  }
  bindRenderbuffer() {}
  bindTexture() {}
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
  drawElementsInstanced() {
    this.drawCalls += 1;
  }
  enable() {}
  enableVertexAttribArray() {}
  finish() {}
  framebufferRenderbuffer() {}
  framebufferTexture2D() {}
  getError() {
    return this.NO_ERROR;
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
    return false;
  }
  linkProgram() {}
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
    pixels[0] = this.framebuffer === null
      ? 255
      : Math.round(this.pickColor[0] * 255);
    pixels[1] = this.framebuffer === null
      ? 0
      : Math.round(this.pickColor[1] * 255);
    pixels[2] = this.framebuffer === null
      ? 0
      : Math.round(this.pickColor[2] * 255);
    pixels[3] = 255;
  }
  renderbufferStorage() {}
  shaderSource() {}
  texImage2D() {}
  texParameteri() {}
  uniform1i() {}
  uniform3f(location, red, green, blue) {
    this.pickColor = [red, green, blue];
  }
  uniformMatrix4fv() {}
  useProgram() {}
  vertexAttribDivisor() {}
  vertexAttribPointer() {}
  viewport() {}
}

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
  const canvas = {
    height: 0,
    width: 0,
    getContext(name, options) {
      assert.equal(name, "webgl2");
      assert.equal(options.preserveDrawingBuffer, true);
      return context;
    },
  };
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
  assert.equal(selectedView.viewRevision, 3);
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
  assert.equal(renderer.state.viewUpdates, 3);
  assert.equal(backend.state.frames, 4);
  assert.equal(backend.state.selectedPickIds, 1);
  assert.equal(context.drawCalls, 9);

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
  assert.equal(context.deletedBuffers, 3);
  assert.equal(context.deletedPrograms, 2);
  assert.equal(backend.state.activeBytes, 0);
  assert.equal(await renderer.dispose(), true);
  assert.equal(backend.state.disposed, true);
  assert.equal(await session.dispose(), true);
  assert.equal(await source.dispose(), true);
});
