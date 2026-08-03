import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "@bim-explorer/bim-renderer-3d";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "@bim-explorer/bim-model-source";

import {
  createWebIfcSourceArtifact,
} from "./create-source-artifact.mjs";

export const WEB_IFC_HEADLESS_RENDERER_REPORT =
  "bim-explorer-web-ifc-headless-renderer-report/1";

function parseArguments(values) {
  if (values.length !== 6) {
    throw new TypeError(
      "usage: node measure-headless-renderer.mjs " +
        "--input <source.ifc> --fixture-id <id> --profile <profile>",
    );
  }
  const result = {
    input: null,
    fixtureId: null,
    profile: null,
  };
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (name === "--input" && value) {
      result.input = path.resolve(value);
    } else if (
      name === "--fixture-id" &&
      /^[a-z0-9][a-z0-9-]+$/u.test(value ?? "")
    ) {
      result.fixtureId = value;
    } else if (
      name === "--profile" &&
      /^[a-z0-9][a-z0-9-]+$/u.test(value ?? "")
    ) {
      result.profile = value;
    } else {
      throw new TypeError(`invalid headless renderer argument ${name}`);
    }
  }
  if (
    result.input === null ||
    result.fixtureId === null ||
    result.profile === null
  ) {
    throw new TypeError("headless renderer arguments must be unique");
  }
  return result;
}

async function safeDispose(operation) {
  try {
    return await operation();
  } catch {
    return false;
  }
}

export async function measureWebIfcHeadlessRenderer(
  input,
  fixtureId,
  profile,
) {
  const totalStarted = performance.now();
  let artifact;
  let backend;
  let bytes;
  let renderer;
  let session;
  let source;
  let snapshot;
  let receipt;
  let unmountReceipt;
  let sourceStateAfterMount;
  let rendererStateAfterMount;
  let backendStateAfterMount;
  let memoryAfterMount;
  let readMs = 0;
  let artifactMs = 0;
  let sourceMs = 0;
  let mountMs = 0;
  let rendererDisposed = false;
  let sessionDisposed = false;
  let sourceDisposed = false;

  try {
    const readStarted = performance.now();
    bytes = await readFile(input);
    readMs = performance.now() - readStarted;
    const artifactStarted = performance.now();
    artifact = await createWebIfcSourceArtifact(bytes, {
      profile,
    });
    artifactMs = performance.now() - artifactStarted;
    const sourceStarted = performance.now();
    source = createBimModelSource(artifact, {
      maximumRequestBytes: 1_048_576,
    });
    session = await source.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    snapshot = await session.getSnapshot();
    sourceMs = performance.now() - sourceStarted;
    backend = createHeadless3dBackend();
    renderer = createBounded3dRenderer({ backend });
    const mountStarted = performance.now();
    receipt = await renderer.mount({ session, snapshot });
    mountMs = performance.now() - mountStarted;
    sourceStateAfterMount = source.state;
    rendererStateAfterMount = renderer.state;
    backendStateAfterMount = backend.state;
    memoryAfterMount = process.memoryUsage();
    unmountReceipt = await renderer.unmount();
  } finally {
    rendererDisposed = renderer === undefined
      ? false
      : await safeDispose(() => renderer.dispose());
    sessionDisposed = session === undefined
      ? false
      : await safeDispose(() => session.dispose());
    sourceDisposed = source === undefined
      ? false
      : await safeDispose(() => source.dispose());
  }
  if (
    artifact === undefined ||
    backend === undefined ||
    bytes === undefined ||
    renderer === undefined ||
    snapshot === undefined ||
    receipt === undefined ||
    unmountReceipt === undefined ||
    sourceStateAfterMount === undefined ||
    rendererStateAfterMount === undefined ||
    backendStateAfterMount === undefined ||
    memoryAfterMount === undefined
  ) {
    throw new Error("headless renderer measurement is incomplete");
  }
  return {
    schema: WEB_IFC_HEADLESS_RENDERER_REPORT,
    status: "passed",
    fixture: {
      id: fixtureId,
      byteLength: bytes.byteLength,
      sha256: artifact.source.sha256,
      schema: artifact.source.ifcSchema,
      profile: artifact.source.profile,
    },
    adapter: {
      id: artifact.adapter.id,
      version: artifact.adapter.version,
      backend: "node-wasm-isolated-headless-renderer",
      license: artifact.adapter.license,
    },
    snapshot: {
      sourceFingerprint: snapshot.source.fingerprint,
      revisionId: snapshot.revisionId,
      cacheFingerprint: snapshot.cacheFingerprint,
      geometry: snapshot.geometry,
      loadPlan: {
        firstRangeIds: snapshot.loadPlan.firstFrameRangeIds,
        deferredRangeIds: snapshot.loadPlan.deferredRangeIds,
      },
      ranges: snapshot.layers[0].rangeHandles.map((handle) => ({
        handleId: handle.handleId,
        byteLength: handle.byteLength,
        sha256: handle.sha256,
      })),
    },
    renderer: {
      contract: receipt.schema,
      backend: "headless",
      actualGpu: false,
      limits: renderer.limits,
      receipt,
      sourceStateAfterMount,
      rendererStateAfterMount,
      backendStateAfterMount,
      unmountReceipt,
    },
    performance: {
      readMs,
      artifactMs,
      sourceMs,
      mountMs,
      totalMs: performance.now() - totalStarted,
    },
    processMemoryBytes: {
      maximumResidentSetSize:
        process.resourceUsage().maxRSS * 1024,
      residentSetSizeAfterMount: memoryAfterMount.rss,
      heapUsedAfterMount: memoryAfterMount.heapUsed,
    },
    cleanup: {
      adapterModelClosed: artifact.adapter.cleanup.modelClosed,
      adapterEngineDisposed:
        artifact.adapter.cleanup.engineDisposed,
      rendererDisposed,
      sessionDisposed,
      sourceDisposed,
      backendDisposed: backend.state.disposed,
      backendActiveBytes: backend.state.activeBytes,
    },
    diagnostics: [],
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = await measureWebIfcHeadlessRenderer(
    options.input,
    options.fixtureId,
    options.profile,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
