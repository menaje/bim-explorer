function assertVector3(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${label} must contain three finite coordinates`);
  }
  return Object.freeze([...value]);
}

export function createPerspectiveCamera({
  eye = [8, 8, 6],
  target = [2, 1, 1.5],
  up = [0, 0, 1],
  fieldOfViewDegrees = 50,
  near = 0.01,
  far = 10000,
} = {}) {
  if (
    !Number.isFinite(fieldOfViewDegrees) ||
    fieldOfViewDegrees <= 0 ||
    fieldOfViewDegrees >= 180 ||
    !Number.isFinite(near) ||
    !Number.isFinite(far) ||
    near <= 0 ||
    far <= near
  ) {
    throw new TypeError("perspective camera frustum is invalid");
  }
  return Object.freeze({
    projection: "perspective",
    eye: assertVector3(eye, "camera eye"),
    target: assertVector3(target, "camera target"),
    up: assertVector3(up, "camera up"),
    fieldOfViewDegrees,
    near,
    far,
  });
}

export class Mock3dPresentation {
  #disposed = false;
  #renders = 0;

  constructor({ snapshot, camera = createPerspectiveCamera() }) {
    if (
      !snapshot?.layers?.some(
        (layer) => layer.representation === "3d",
      )
    ) {
      throw new TypeError("3D presentation requires a 3d layer");
    }
    this.snapshotId = snapshot.snapshotId;
    this.revisionId = snapshot.revisionId;
    this.camera = camera;
  }

  get disposed() {
    return this.#disposed;
  }

  get renders() {
    return this.#renders;
  }

  render() {
    if (this.#disposed) {
      throw new DOMException(
        "3D presentation is disposed",
        "InvalidStateError",
      );
    }
    this.#renders += 1;
    return Object.freeze({
      representation: "3d",
      snapshotId: this.snapshotId,
      revisionId: this.revisionId,
      camera: this.camera,
    });
  }

  dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    return true;
  }
}

export function createMock3dMount(state = {}) {
  return async ({ snapshot }) => {
    const presentation = new Mock3dPresentation({ snapshot });
    state.presentation = presentation;
    state.frame = presentation.render();
    return presentation;
  };
}
