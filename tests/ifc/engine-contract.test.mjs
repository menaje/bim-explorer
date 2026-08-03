import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_NAMES,
  FINGERPRINT_PROJECTION,
  REPORT_SCHEMA,
  finalizeReport,
  validateIfcEngineReport,
} from "../../packages/ifc-engine-contract/src/index.mjs";

function report() {
  return {
    schema: REPORT_SCHEMA,
    engine: {
      id: "fixture-engine",
      version: "1.2.3",
      backend: "test-process",
      license: "TEST-ONLY",
    },
    fixture: {
      id: "synthetic-small-ifc4",
      schema: "IFC4",
      view: "ReferenceView_V1.2",
      byteLength: 42,
      sha256: "a".repeat(64),
    },
    capabilities: Object.fromEntries(
      CAPABILITY_NAMES.map((name) => [name, "blocked"]),
    ),
    semantics: {
      entityCounts: {
        IfcProject: 1,
        IfcWall: 1,
      },
      globalIds: {
        count: 2,
        duplicates: 0,
        missingOnIfcRoot: 0,
      },
      spatialHierarchy: [
        "Synthetic Project",
        "Synthetic Site",
      ],
      wall: {
        name: "Wall-01",
        tag: "W-01",
        type: "WallType-01",
        materials: ["Concrete"],
        propertySets: ["Pset_WallCommon"],
      },
    },
    relations: {
      IfcRelAggregates: 1,
    },
    geometry: {
      products: 1,
      geometries: 1,
      vertices: 8,
      triangles: 12,
      coordinateSystem: "ifc-world-z-up",
      bounds: {
        min: [0, 0.9, 0],
        max: [4, 1.1, 3],
      },
    },
    performance: {
      initializationMs: 1,
      openMs: 2,
      semanticMs: 3,
      geometryMs: 4,
      totalMs: 10,
      peakRssBytes: 100,
      heapUsedBytes: 50,
    },
    cleanup: {
      modelClosed: true,
      engineDisposed: true,
    },
    diagnostics: [],
  };
}

test("finalized IFC engine report validates", () => {
  const finalized = finalizeReport(report());
  assert.equal(finalized.fingerprint.projection, FINGERPRINT_PROJECTION);
  assert.equal(validateIfcEngineReport(finalized).triangles, 12);
});

test("performance does not perturb the deterministic fingerprint", () => {
  const first = finalizeReport(report());
  const slower = report();
  slower.performance.totalMs = 999;
  slower.performance.peakRssBytes = 999;
  const second = finalizeReport(slower);
  assert.equal(first.fingerprint.value, second.fingerprint.value);
});

test("semantic changes perturb the deterministic fingerprint", () => {
  const first = finalizeReport(report());
  const changed = report();
  changed.semantics.wall.name = "Changed Wall";
  const second = finalizeReport(changed);
  assert.notEqual(first.fingerprint.value, second.fingerprint.value);
});

test("report rejects paths and stale fingerprints", () => {
  const withPath = finalizeReport(report());
  withPath.fixture.sourcePath = "/private/customer.ifc";
  assert.throws(
    () => validateIfcEngineReport(withPath),
    /must not expose a source path/u,
  );

  const stale = finalizeReport(report());
  stale.geometry.triangles = 13;
  assert.throws(
    () => validateIfcEngineReport(stale),
    /fingerprint does not match/u,
  );
});
