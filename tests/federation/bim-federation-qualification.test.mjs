import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyBimFederation,
} from "../../scripts/qualify-bim-federation.mjs";

test("BIM federation qualification matches committed evidence", async () => {
  const current = await qualifyBimFederation();
  const committed = JSON.parse(
    await readFile(
      "compatibility/evidence/" +
        "bim-federation-synthetic-2026-08-04.json",
      "utf8",
    ),
  );
  assert.deepEqual(current, committed);
});
