export const BIM_RENDERER_3D_HOST_CONTRACT =
  "bim-explorer-bim-renderer-3d-host/0.1";
export const BIM_RENDERER_3D_HOST_RECEIPT =
  "bim-explorer-bim-renderer-3d-host-receipt/0.1";

const HOST_KINDS = Object.freeze([
  "browser",
  "vscode-webview",
]);

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function validateRenderer(value) {
  const renderer = plainRecord(value, "3D host renderer");
  for (const method of [
    "mount",
    "renderView",
    "pick",
    "loadRange",
    "evictRange",
    "applyRenderDelta",
    "unmount",
    "dispose",
  ]) {
    if (typeof renderer[method] !== "function") {
      throw new TypeError(
        `3D host renderer.${method} must be a function`,
      );
    }
  }
  return renderer;
}

function validateSession(value) {
  const session = plainRecord(value, "3D host range session");
  if (
    typeof session.readRange !== "function" ||
    typeof session.dispose !== "function"
  ) {
    throw new TypeError(
      "3D host range session must support readRange and dispose",
    );
  }
  return session;
}

function validateWorkerLease(value) {
  if (value === null) {
    return null;
  }
  const worker = plainRecord(value, "3D host Worker lease");
  if (
    typeof worker.dispose !== "function" &&
    typeof worker.terminate !== "function"
  ) {
    throw new TypeError(
      "3D host Worker lease must support dispose or terminate",
    );
  }
  return worker;
}

async function releaseResource(resource, role) {
  if (resource === null) {
    return Object.freeze({
      role,
      present: false,
      method: null,
      released: false,
    });
  }
  const method = typeof resource.dispose === "function"
    ? "dispose"
    : "terminate";
  const result = await resource[method]();
  if (result === false) {
    throw new Error(
      `3D host ${role} was already released`,
    );
  }
  return Object.freeze({
    role,
    present: true,
    method,
    released: true,
  });
}

function rendererSource(receipt) {
  const source = plainRecord(
    receipt?.source,
    "3D host renderer receipt source",
  );
  nonEmptyString(
    source.fingerprint,
    "3D host renderer source fingerprint",
  );
  nonEmptyString(
    source.revisionId,
    "3D host renderer source revisionId",
  );
  return Object.freeze({
    fingerprint: source.fingerprint,
    revisionId: source.revisionId,
  });
}

export class BimRenderer3dHost {
  #activeSource = null;
  #commands = 0;
  #disposed = false;
  #kind;
  #mounts = 0;
  #queue = Promise.resolve();
  #rangeSession = null;
  #releases = [];
  #renderer;
  #sourceSwitches = 0;
  #workerLease = null;

  constructor({
    kind,
    renderer,
  } = {}) {
    if (!HOST_KINDS.includes(kind)) {
      throw new TypeError(
        "3D host kind must be browser or vscode-webview",
      );
    }
    this.#kind = kind;
    this.#renderer = validateRenderer(renderer);
  }

  get state() {
    return Object.freeze({
      contract: BIM_RENDERER_3D_HOST_CONTRACT,
      kind: this.#kind,
      disposed: this.#disposed,
      commands: this.#commands,
      mounts: this.#mounts,
      sourceSwitches: this.#sourceSwitches,
      activeSource: this.#activeSource,
      activeRangeSession: this.#rangeSession !== null,
      activeWorkerLease: this.#workerLease !== null,
      releases: Object.freeze([...this.#releases]),
      renderer: this.#renderer.state,
    });
  }

  #assertActive() {
    if (this.#disposed) {
      throw invalidState("3D host is disposed");
    }
    if (this.#rangeSession === null) {
      throw invalidState("3D host has no active source");
    }
  }

  #enqueue(operation) {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #releasePair(rangeSession, workerLease) {
    const receipts = [];
    const errors = [];
    for (const [resource, role] of [
      [rangeSession, "range-session"],
      [workerLease, "worker"],
    ]) {
      try {
        const receipt = await releaseResource(resource, role);
        receipts.push(receipt);
        if (receipt.present) {
          this.#releases.push(receipt);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        "3D host source resource release failed",
      );
    }
    return Object.freeze(receipts);
  }

  mount(options) {
    return this.#enqueue(() => this.#mount(options));
  }

  async #mount({
    initialCamera = null,
    initialRangeStrategy = "source-plan",
    session: sessionValue,
    snapshot,
    signal,
    workerLease: workerLeaseValue = null,
  } = {}) {
    if (this.#disposed) {
      throw invalidState("3D host is disposed");
    }
    const session = validateSession(sessionValue);
    const workerLease = validateWorkerLease(workerLeaseValue);
    const priorSession = this.#rangeSession;
    const priorWorker = this.#workerLease;
    const priorSource = this.#activeSource;
    let rendererReceipt;
    try {
      rendererReceipt = await this.#renderer.mount({
        initialCamera,
        initialRangeStrategy,
        session,
        snapshot,
        signal,
      });
    } catch (error) {
      const cleanupErrors = [];
      try {
        await this.#renderer.unmount();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      const resources = new Set([
        priorSession,
        priorWorker,
        session,
        workerLease,
      ]);
      this.#rangeSession = null;
      this.#workerLease = null;
      this.#activeSource = null;
      for (const resource of resources) {
        if (resource === null) {
          continue;
        }
        try {
          const role =
            typeof resource.readRange === "function"
              ? "range-session"
              : "worker";
          const receipt = await releaseResource(resource, role);
          this.#releases.push(receipt);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "3D host mount and cleanup failed",
        );
      }
      throw error;
    }
    const source = rendererSource(rendererReceipt);
    let priorResources = Object.freeze([]);
    if (priorSession !== null) {
      try {
        priorResources = await this.#releasePair(
          priorSession === session ? null : priorSession,
          priorWorker === workerLease ? null : priorWorker,
        );
      } catch (error) {
        const cleanupErrors = [error];
        try {
          await this.#renderer.unmount();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        try {
          await this.#releasePair(session, workerLease);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        this.#rangeSession = null;
        this.#workerLease = null;
        this.#activeSource = null;
        throw new AggregateError(
          cleanupErrors,
          "3D host source switch cleanup failed",
        );
      }
    }
    const sourceSwitch =
      priorSource !== null &&
      (
        priorSource.fingerprint !== source.fingerprint ||
        priorSource.revisionId !== source.revisionId
      );
    this.#rangeSession = session;
    this.#workerLease = workerLease;
    this.#activeSource = source;
    this.#commands += 1;
    this.#mounts += 1;
    if (sourceSwitch) {
      this.#sourceSwitches += 1;
    }
    return Object.freeze({
      schema: BIM_RENDERER_3D_HOST_RECEIPT,
      status: "mounted",
      commandSequence: this.#commands,
      host: Object.freeze({
        contract: BIM_RENDERER_3D_HOST_CONTRACT,
        kind: this.#kind,
      }),
      source,
      sourceSwitch,
      priorResources,
      renderer: rendererReceipt,
    });
  }

  renderView(options) {
    return this.#enqueue(() => this.#renderView(options));
  }

  async #renderView(options) {
    this.#assertActive();
    const receipt = await this.#renderer.renderView(options);
    this.#commands += 1;
    return receipt;
  }

  pick(options) {
    return this.#enqueue(() => this.#pick(options));
  }

  async #pick(options) {
    this.#assertActive();
    const receipt = await this.#renderer.pick(options);
    this.#commands += 1;
    return receipt;
  }

  loadRange(options) {
    return this.#enqueue(() => this.#loadRange(options));
  }

  async #loadRange(options) {
    this.#assertActive();
    const receipt = await this.#renderer.loadRange(options);
    this.#commands += 1;
    return receipt;
  }

  evictRange(options) {
    return this.#enqueue(() => this.#evictRange(options));
  }

  async #evictRange(options) {
    this.#assertActive();
    const receipt = await this.#renderer.evictRange(options);
    this.#commands += 1;
    return receipt;
  }

  applyRenderDelta(options) {
    return this.#enqueue(
      () => this.#applyRenderDelta(options),
    );
  }

  async #applyRenderDelta(options) {
    this.#assertActive();
    const receipt =
      await this.#renderer.applyRenderDelta(options);
    this.#commands += 1;
    return receipt;
  }

  dispose(options) {
    return this.#enqueue(() => this.#dispose(options));
  }

  async #dispose({
    reason = "host-dispose",
  } = {}) {
    if (this.#disposed) {
      return false;
    }
    nonEmptyString(reason, "3D host dispose reason");
    const errors = [];
    let rendererDisposed = false;
    let resources = Object.freeze([]);
    try {
      rendererDisposed = await this.#renderer.dispose();
      if (rendererDisposed !== true) {
        throw new Error("3D host renderer did not dispose");
      }
    } catch (error) {
      errors.push(error);
    }
    try {
      resources = await this.#releasePair(
        this.#rangeSession,
        this.#workerLease,
      );
    } catch (error) {
      errors.push(error);
    }
    this.#rangeSession = null;
    this.#workerLease = null;
    this.#activeSource = null;
    this.#disposed = true;
    this.#commands += 1;
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        "3D host disposal failed",
      );
    }
    return Object.freeze({
      schema: BIM_RENDERER_3D_HOST_RECEIPT,
      status: "disposed",
      commandSequence: this.#commands,
      host: Object.freeze({
        contract: BIM_RENDERER_3D_HOST_CONTRACT,
        kind: this.#kind,
      }),
      reason,
      rendererDisposed,
      resources,
    });
  }
}

export function createBimRenderer3dHost(options) {
  return new BimRenderer3dHost(options);
}
