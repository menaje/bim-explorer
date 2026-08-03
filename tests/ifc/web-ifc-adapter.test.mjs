import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inspectWebIfc,
} from "../../adapters/web-ifc/src/inspect.mjs";
import {
  validateIfcEngineReport,
} from "../../packages/ifc-engine-contract/src/index.mjs";
import {
  syntheticIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

test("web-ifc adapter satisfies the synthetic IFC contract", async () => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-web-ifc-test-"),
  );
  const input = path.join(temporary, "fixture.ifc");
  try {
    await writeFile(input, syntheticIfc(), "utf8");
    const report = await inspectWebIfc(input);
    const validation = validateIfcEngineReport(report);
    assert.equal(validation.engine, "web-ifc@0.0.77");
    assert.equal(report.fixture.schema, "IFC4");
    assert.deepEqual(report.semantics.spatialHierarchy, [
      "Synthetic Project",
      "Synthetic Site",
      "Synthetic Building",
      "Level 01",
    ]);
    assert.deepEqual(report.semantics.globalIds, {
      count: 17,
      duplicates: 0,
      missingOnIfcRoot: 0,
    });
    assert.equal(report.geometry.triangles, 12);
    assert.deepEqual(report.geometry.bounds, {
      min: [0, 0.9, 0],
      max: [4, 1.1, 3],
    });
    assert.equal(report.cleanup.modelClosed, true);
    assert.equal(report.cleanup.engineDisposed, true);
  } finally {
    await rm(temporary, {
      recursive: true,
      force: true,
    });
  }
});
