import assert from "node:assert/strict";
import test from "node:test";

import {
  attachCameraControls3d,
  createCameraInteraction3d,
  createFitCamera3d,
} from "../../packages/bim-renderer-3d/src/index.mjs";

const camera = createFitCamera3d({
  min: [0, 0, 0],
  max: [10, 8, 3],
});

test("camera interaction maps pointer and wheel input immutably", () => {
  const interaction = createCameraInteraction3d({
    camera,
    height: 540,
    width: 960,
  });
  interaction.pointerDown({
    button: 0,
    pointerId: 1,
    x: 480,
    y: 270,
  });
  const orbited = interaction.pointerMove({
    pointerId: 1,
    x: 560,
    y: 230,
  });
  assert.notEqual(orbited.yaw, camera.yaw);
  assert.notEqual(orbited.pitch, camera.pitch);
  assert.equal(interaction.pointerUp({ pointerId: 1 }), true);

  interaction.pointerDown({
    button: 1,
    pointerId: 2,
    x: 480,
    y: 270,
  });
  const panned = interaction.pointerMove({
    pointerId: 2,
    x: 520,
    y: 300,
  });
  assert.notDeepEqual(panned.target, orbited.target);
  interaction.pointerUp({ pointerId: 2 });
  const zoomed = interaction.wheel({ deltaY: -120 });
  assert.ok(zoomed.distance < panned.distance);
  assert.deepEqual(interaction.state, {
    disposed: false,
    dragging: false,
    dragMode: null,
    events: 7,
    keyboardUpdates: 0,
    orbitUpdates: 1,
    panUpdates: 1,
    programmaticUpdates: 0,
    resetUpdates: 0,
    zoomUpdates: 1,
    camera: zoomed,
  });
  assert.equal(interaction.dispose(), true);
  assert.equal(interaction.dispose(), false);
  assert.throws(
    () => interaction.wheel({ deltaY: 1 }),
    /disposed/u,
  );
});

test("programmatic camera updates preserve or replace Home reset", () => {
  const interaction = createCameraInteraction3d({
    camera,
    height: 540,
    width: 960,
  });
  const selectedFit = createFitCamera3d({
    min: [2, 2, 1],
    max: [4, 5, 2],
  });
  assert.deepEqual(
    interaction.setCamera(selectedFit),
    selectedFit,
  );
  assert.deepEqual(
    interaction.key({ key: "Home" }).camera,
    camera,
  );
  interaction.setCamera(selectedFit, {
    resetInitial: true,
  });
  assert.deepEqual(
    interaction.key({ key: "Home" }).camera,
    selectedFit,
  );
  assert.equal(interaction.state.programmaticUpdates, 2);
  assert.equal(interaction.state.resetUpdates, 2);
});

test("DOM camera controls serialize rendered camera updates", async () => {
  const listeners = new Map();
  const element = {
    addEventListener(type, listener) {
      const values = listeners.get(type) ?? new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener({
          preventDefault() {},
          ...event,
        });
      }
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const updates = [];
  const controls = attachCameraControls3d({
    camera,
    element,
    height: 540,
    width: 960,
    async onCamera(nextCamera, interaction) {
      updates.push({
        interaction,
        camera: nextCamera,
      });
      if (interaction.kind === "rejected-fit") {
        throw new Error("rejected programmatic render");
      }
    },
  });
  element.emit("pointerdown", {
    button: 0,
    pointerId: 1,
    clientX: 400,
    clientY: 250,
  });
  element.emit("pointermove", {
    pointerId: 1,
    clientX: 460,
    clientY: 210,
  });
  element.emit("pointerup", {
    pointerId: 1,
  });
  element.emit("wheel", {
    deltaY: 80,
  });
  await controls.setCamera(camera, {
    kind: "fit-selection",
  });
  await controls.whenIdle();

  assert.deepEqual(
    updates.map((update) => update.interaction.kind),
    ["orbit", "zoom", "fit-selection"],
  );
  assert.equal(controls.state.orbitUpdates, 1);
  assert.equal(controls.state.programmaticUpdates, 1);
  assert.equal(controls.state.zoomUpdates, 1);
  const beforeRejectedFit = controls.state.camera;
  await assert.rejects(
    controls.setCamera(createFitCamera3d({
      min: [2, 2, 1],
      max: [4, 5, 2],
    }), {
      kind: "rejected-fit",
    }),
    /rejected programmatic render/u,
  );
  assert.deepEqual(controls.state.camera, beforeRejectedFit);
  element.emit("wheel", {
    deltaY: -40,
  });
  await controls.whenIdle();
  assert.equal(controls.state.zoomUpdates, 2);
  assert.equal(controls.dispose(), true);
  assert.equal(controls.dispose(), false);
  assert.equal(listeners.get("pointerdown").size, 0);
  assert.equal(listeners.get("wheel").size, 0);
});

test("DOM camera controls distinguish a primary click from orbit drag", async () => {
  const listeners = new Map();
  const element = {
    addEventListener(type, listener) {
      const values = listeners.get(type) ?? new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener({
          preventDefault() {},
          ...event,
        });
      }
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const clicks = [];
  const updates = [];
  const controls = attachCameraControls3d({
    camera,
    element,
    height: 540,
    width: 960,
    async onCamera(nextCamera, interaction) {
      updates.push({
        camera: nextCamera,
        kind: interaction.kind,
      });
    },
    async onPrimaryClick(value) {
      clicks.push(value);
    },
  });

  element.emit("pointerdown", {
    button: 0,
    pointerId: 3,
    clientX: 200,
    clientY: 120,
  });
  element.emit("pointermove", {
    pointerId: 3,
    clientX: 203,
    clientY: 122,
  });
  element.emit("pointerup", {
    pointerId: 3,
    clientX: 203,
    clientY: 122,
  });
  element.emit("pointerdown", {
    button: 0,
    pointerId: 4,
    clientX: 300,
    clientY: 220,
  });
  element.emit("pointermove", {
    pointerId: 4,
    clientX: 340,
    clientY: 250,
  });
  element.emit("pointerup", {
    pointerId: 4,
    clientX: 340,
    clientY: 250,
  });
  element.emit("pointerdown", {
    button: 0,
    pointerId: 5,
    clientX: 320,
    clientY: 240,
    shiftKey: true,
  });
  element.emit("pointermove", {
    pointerId: 5,
    clientX: 350,
    clientY: 260,
  });
  element.emit("pointerup", {
    pointerId: 5,
    clientX: 350,
    clientY: 260,
  });
  await controls.whenIdle();

  assert.deepEqual(
    updates.map((update) => update.kind),
    ["orbit", "pan"],
  );
  assert.deepEqual(clicks, [{
    clientX: 203,
    clientY: 122,
    pointerId: 3,
  }]);
  assert.equal(controls.state.panUpdates, 1);
  controls.dispose();
  assert.equal(listeners.get("pointercancel").size, 0);
  assert.equal(listeners.get("contextmenu").size, 0);
});

test("DOM camera controls expose bounded keyboard navigation", async () => {
  const listeners = new Map();
  let focused = 0;
  const element = {
    addEventListener(type, listener) {
      const values = listeners.get(type) ?? new Set();
      values.add(listener);
      listeners.set(type, values);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, event) {
      for (const listener of listeners.get(type) ?? []) {
        listener({
          preventDefault() {
            event.prevented = true;
          },
          ...event,
        });
      }
    },
    focus() {
      focused += 1;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  const updates = [];
  const controls = attachCameraControls3d({
    camera,
    element,
    height: 540,
    width: 960,
    async onCamera(nextCamera, interaction) {
      updates.push({
        camera: nextCamera,
        kind: interaction.kind,
      });
    },
  });
  for (const event of [
    { key: "ArrowLeft" },
    { key: "ArrowUp", shiftKey: true },
    { key: "+" },
    { key: "Home" },
  ]) {
    element.emit("keydown", event);
    assert.equal(event.prevented, true);
  }
  const ignored = { key: "ArrowRight", metaKey: true };
  element.emit("keydown", ignored);
  assert.equal(ignored.prevented, undefined);
  element.emit("pointerdown", {
    button: 0,
    pointerId: 8,
    clientX: 10,
    clientY: 10,
  });
  element.emit("pointerup", {
    pointerId: 8,
    clientX: 10,
    clientY: 10,
  });
  await controls.whenIdle();

  assert.equal(focused, 1);
  assert.deepEqual(
    updates.map((update) => update.kind),
    ["orbit", "pan", "zoom", "reset"],
  );
  assert.equal(controls.state.keyboardUpdates, 4);
  assert.equal(controls.state.orbitUpdates, 1);
  assert.equal(controls.state.panUpdates, 1);
  assert.equal(controls.state.programmaticUpdates, 0);
  assert.equal(controls.state.zoomUpdates, 1);
  assert.equal(controls.state.resetUpdates, 1);
  controls.dispose();
  assert.equal(listeners.get("keydown").size, 0);
});
