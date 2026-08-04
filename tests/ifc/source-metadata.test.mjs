import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyBimSourceMetadata,
} from "../../scripts/qualify-bim-source-metadata.mjs";

test("source metadata qualification matches committed evidence", async () => {
  const committed = JSON.parse(await readFile(
    "compatibility/evidence/" +
      "bim-model-source-metadata-2026-08-04.json",
    "utf8",
  ));
  const current = await qualifyBimSourceMetadata();
  assert.deepEqual(current, committed);
  assert.equal(
    current.decision.propertySetValuePayload,
    "passed-deferred-bounded",
  );
  assert.equal(
    current.decision.georeferencingMapConversion,
    "passed-ifc4-synthetic",
  );
  assert.equal(
    current.decision.sourcePrecisionDisplaySeparation,
    "passed-contract",
  );
  assert.equal(current.decision.productionClaims, false);
});
