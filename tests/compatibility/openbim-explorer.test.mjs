import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateOpenBimCompatibility,
} from "../../scripts/check-openbim-compatibility.mjs";

async function inputs() {
  return Promise.all([
    readFile(
      "compatibility/openbim-explorer.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "openbim-explorer-synthetic-2026-08-04.json",
      "utf8",
    ).then(JSON.parse),
  ]);
}

test("openBIM compatibility accepts bounded evidence", async () => {
  const [manifest, evidence] = await inputs();
  assert.equal(
    validateOpenBimCompatibility(manifest, evidence),
    true,
  );
});

test("openBIM compatibility rejects production overclaims", async () => {
  const [manifest, evidence] = await inputs();
  const overclaim = structuredClone(manifest);
  overclaim.gates.nativeIdsIfcValidation = true;
  assert.throws(
    () => validateOpenBimCompatibility(overclaim, evidence),
    /must remain held/u,
  );
});
