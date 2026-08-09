import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyFederatedBimSurface,
} from "../../scripts/qualify-federated-bim-surface.mjs";

test("federated BIM Surface qualification matches committed evidence", async () => {
  const current = await qualifyFederatedBimSurface();
  const committed = JSON.parse(await readFile(
    "compatibility/evidence/" +
      "federated-bim-surface-headless-2026-08-09.json",
    "utf8",
  ));
  assert.deepEqual(current, committed);
});
