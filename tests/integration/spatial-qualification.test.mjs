import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifySpatialIntegration,
} from "../../scripts/qualify-spatial-integration.mjs";

test("Spatial integration qualification matches committed evidence", async () => {
  const current = await qualifySpatialIntegration();
  const committed = JSON.parse(
    await readFile(
      "compatibility/evidence/" +
        "spatial-integration-synthetic-2026-08-04.json",
      "utf8",
    ),
  );
  assert.deepEqual(current, committed);
});
